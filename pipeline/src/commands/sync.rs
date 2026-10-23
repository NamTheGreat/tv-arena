use anyhow::{bail, Result};
use chrono::{Duration as ChronoDuration, Utc};
use serde_json::json;
use std::{thread, time::Duration, time::Instant};

use crate::clients::http::create_http_client;
use crate::clients::reddit::fetch_reddit_stats;
use crate::clients::supabase::{
    batch_record_daily_telemetry, create_sync_run, fetch_prev_reddit_comments,
    fetch_prior_day_score, fetch_series, patch_series_score, update_sync_run, SyncRunUpdate,
};
use crate::clients::wikipedia::fetch_wiki_days;
use crate::config::Config;
use crate::engine::scoring::{calculate_delta, compute_buzz_score};

pub fn run_sync(config: &Config) -> Result<()> {
    let client = create_http_client();
    let start_time = Instant::now();
    let shows = fetch_series(&client, config)?;

    if shows.is_empty() {
        println!("ℹ️  No series found in Supabase. Run 'cargo run -- seed' or execute 'supabase/schema.sql' to initialize show records.");
        return Ok(());
    }

    let run_id = create_sync_run(&client, config, shows.len());

    // Use yesterday as the end boundary so completed Wikimedia day dumps are guaranteed published
    let now = Utc::now();
    let yesterday = now - ChronoDuration::days(1);
    let start_date = yesterday - ChronoDuration::days(6);
    let start_str = start_date.format("%Y%m%d00").to_string();
    let end_str = yesterday.format("%Y%m%d00").to_string();
    let recorded_date = yesterday.format("%Y-%m-%d").to_string();

    println!(
        "Syncing {} shows for 7-day window {} -> {} (recorded_date: {})...",
        shows.len(),
        start_str,
        end_str,
        recorded_date
    );

    let mut fetch_failures = 0;
    let mut updated_count = 0;
    let mut wiki_failures = 0;
    let mut reddit_failures = 0;
    let mut error_log = String::new();

    for show in &shows {
        let Some(show_id) = &show.id else { continue };

        let wiki_days =
            fetch_wiki_days(&client, &show.wiki_slug, &start_str, &end_str, &show.title);
        let reddit_stats = fetch_reddit_stats(&client, &show.reddit_query, &show.title);

        if wiki_days.is_none() {
            wiki_failures += 1;
        }
        if reddit_stats.is_none() {
            reddit_failures += 1;
        }

        // If both sources failed or throttled, DO NOT store fake 0s. Skip this show and retain previous valid telemetry.
        if wiki_days.is_none() && reddit_stats.is_none() {
            let msg = format!("Both Wikipedia and Reddit failed for '{}'", show.title);
            eprintln!("❌ {}. Skipping to preserve historical scores.", msg);
            if !error_log.is_empty() {
                error_log.push_str("; ");
            }
            error_log.push_str(&msg);
            fetch_failures += 1;
            continue;
        }

        let total_wiki: i64 = wiki_days
            .as_ref()
            .map(|days| days.iter().map(|d| d.views).sum())
            .unwrap_or(0);

        // Carry forward previous Reddit metrics if Reddit 403/429 occurs, preventing wild artificial swings
        let (total_comments, total_upvotes) = if let Some(stats) = reddit_stats {
            stats
        } else {
            let prev_comments = fetch_prev_reddit_comments(&client, config, show_id);
            if let Some(c) = prev_comments {
                eprintln!(
                    "ℹ️  Reddit throttled for '{}'; carrying forward last recorded comments ({})",
                    show.title, c
                );
                (c * 7, 0)
            } else {
                (0, 0)
            }
        };

        let new_score = compute_buzz_score(total_wiki, total_comments, total_upvotes);

        // Guard against overwriting existing valid scores if upstream fetch returned 0
        if new_score == 0 && show.buzz_score > 0 {
            eprintln!(
                "⚠️  Calculated 0 buzz score for '{}'; skipping patch to protect existing score ({})",
                show.title, show.buzz_score
            );
            continue;
        }

        // To handle same-day manual re-runs gracefully, compare against the previous day's telemetry
        let prior_day_score = fetch_prior_day_score(&client, config, show_id, &recorded_date);

        let delta_pct = if let Some(prior_score) = prior_day_score {
            calculate_delta(new_score, prior_score)
        } else if show.buzz_score > 0 {
            calculate_delta(new_score, show.buzz_score)
        } else if let Some(ref days) = wiki_days {
            if days.len() >= 2 {
                let first_day = days.first().map(|d| d.views).unwrap_or(0);
                let last_day = days.last().map(|d| d.views).unwrap_or(0);
                let first_est =
                    compute_buzz_score(first_day, total_comments / 7, total_upvotes / 7);
                let last_est = compute_buzz_score(last_day, total_comments / 7, total_upvotes / 7);
                calculate_delta(last_est, first_est)
            } else {
                0.0
            }
        } else {
            0.0
        };

        if let Err(e) = patch_series_score(&client, config, show_id, new_score, delta_pct) {
            eprintln!("❌ Failed updating series row for '{}': {}", show.title, e);
            fetch_failures += 1;
            continue;
        }

        // True batch upsert: send an array in a single POST request
        let mut telemetry_batch = Vec::new();
        if let Some(ref days) = wiki_days {
            let last_idx = days.len().saturating_sub(1);
            for (i, day) in days.iter().enumerate() {
                if day.timestamp.len() >= 8 {
                    let date_iso = format!(
                        "{}-{}-{}",
                        &day.timestamp[0..4],
                        &day.timestamp[4..6],
                        &day.timestamp[6..8]
                    );
                    let is_latest = i == last_idx;
                    // Apply current Reddit velocity to latest day; past days retain their pure Wiki views
                    let daily_comments = if is_latest { total_comments / 7 } else { 0 };
                    let daily_upvotes = if is_latest { total_upvotes / 7 } else { 0 };
                    let daily_est = compute_buzz_score(day.views, daily_comments, daily_upvotes);

                    telemetry_batch.push(json!({
                        "series_id": show_id,
                        "recorded_date": date_iso,
                        "daily_score": daily_est,
                        "wiki_views": day.views,
                        "reddit_comments": daily_comments
                    }));
                }
            }
        } else {
            telemetry_batch.push(json!({
                "series_id": show_id,
                "recorded_date": recorded_date,
                "daily_score": new_score / 7,
                "wiki_views": total_wiki,
                "reddit_comments": total_comments / 7
            }));
        }

        if let Err(e) = batch_record_daily_telemetry(&client, config, telemetry_batch) {
            eprintln!(
                "❌ Failed batch recording daily telemetry for '{}': {}",
                show.title, e
            );
            fetch_failures += 1;
            continue;
        }

        updated_count += 1;
        println!("✓ {}: score {} ({:+.1}%)", show.title, new_score, delta_pct);
        thread::sleep(Duration::from_millis(600));
    }

    println!(
        "\nSync complete. Successfully updated: {}/{}. Failures: {}.",
        updated_count,
        shows.len(),
        fetch_failures
    );

    let duration_ms = start_time.elapsed().as_millis() as i64;
    let status = if fetch_failures == 0 && updated_count == shows.len() {
        "success"
    } else if updated_count > 0 {
        "partial"
    } else {
        "failed"
    };

    if let Some(id) = run_id {
        let update = SyncRunUpdate {
            status,
            shows_updated: updated_count,
            shows_failed: fetch_failures,
            wiki_failures,
            reddit_failures,
            error_log: if error_log.is_empty() {
                None
            } else {
                Some(&error_log)
            },
            duration_ms,
        };
        update_sync_run(&client, config, id, &update);
    }

    // Fail the run if over 40% of shows failed to sync so GitHub Actions alerts accurately
    if !shows.is_empty() && fetch_failures > (shows.len() * 4 / 10) {
        bail!(
            "Sync failed: too many telemetry fetch errors ({}/{} shows failed)",
            fetch_failures,
            shows.len()
        );
    }

    // Run daily-deck generation as part of daily sync, idempotent (ON CONFLICT DO NOTHING)
    if let Err(e) = crate::commands::daily_deck::run_daily_deck(config, None) {
        eprintln!("⚠️  Failed generating daily deck during sync: {}", e);
    }

    Ok(())
}
