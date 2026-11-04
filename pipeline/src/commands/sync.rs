use anyhow::{bail, Result};
use chrono::{Duration as ChronoDuration, Utc};
use serde_json::json;
use std::{thread, time::Duration, time::Instant};

use crate::clients::http::create_http_client;
use crate::clients::supabase::{
    batch_record_daily_telemetry, create_sync_run, fetch_prev_reddit_metrics, fetch_series,
    fetch_series_signal_history, record_series_breakout, update_sync_run, SyncRunUpdate,
};
use crate::clients::{HttpTelemetryFetcher, TelemetryFetcher};
use crate::config::Config;
use crate::engine::anomaly::{detect_signal_breakout, REDDIT_COMMENTS_FLOOR, WIKI_VIEWS_FLOOR};

pub fn run_sync(config: &Config) -> Result<()> {
    let client = create_http_client();
    let fetcher = HttpTelemetryFetcher { client: &client };
    run_sync_with_fetcher(config, &client, &fetcher)?;
    Ok(())
}

pub fn run_sync_with_fetcher<F: TelemetryFetcher>(
    config: &Config,
    client: &ureq::Agent,
    fetcher: &F,
) -> Result<usize> {
    let start_time = Instant::now();
    let shows = fetch_series(client, config)?;

    if shows.is_empty() {
        println!("ℹ️  No series found in Supabase. Run 'cargo run -- seed' or execute 'supabase/schema.sql' to initialize show records.");
        return Ok(0);
    }

    let run_id = create_sync_run(client, config, shows.len());

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

    if config.tmdb_api_key.is_none() {
        println!("ℹ️  TMDB_API_KEY not set; skipping series event milestone checks during sync.");
    }

    let mut fetch_failures = 0;
    let mut updated_count = 0;
    let mut breakouts_flagged = 0;
    let mut wiki_failures = 0;
    let mut reddit_failures = 0;
    let mut error_log = String::new();

    for show in &shows {
        let Some(show_id) = &show.id else { continue };

        let wiki_days = fetcher.fetch_wiki_days(&show.wiki_slug, &start_str, &end_str, &show.title);
        let reddit_stats = fetcher.fetch_reddit_stats(&show.reddit_query, &show.title);

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
        if wiki_days.is_none() {
            // Do not fabricate zero wiki observations when the source is unavailable.
            fetch_failures += 1;
            continue;
        }

        let previous_reddit = if reddit_stats.is_none() {
            fetch_prev_reddit_metrics(client, config, show_id)
        } else {
            None
        };
        // The API returns a seven-day window for Wikipedia, but historical dates
        // must be immutable. Store only the completed day. Reddit is queried for
        // the last 24 hours, so those signals belong to this observation date.
        let Some(days) = wiki_days.as_ref() else {
            continue;
        };
        let Some(day) = days.last() else { continue };
        if day.timestamp.len() < 8 {
            continue;
        }
        let date_iso = format!(
            "{}-{}-{}",
            &day.timestamp[0..4],
            &day.timestamp[4..6],
            &day.timestamp[6..8]
        );
        let reddit_metrics = reddit_stats.or(previous_reddit);
        let reddit_comments = reddit_metrics.map(|(comments, _)| comments);
        let reddit_upvotes = reddit_metrics.map(|(_, upvotes)| upvotes);
        let telemetry_batch = vec![json!({
            "series_id": show_id,
            "recorded_date": date_iso,
            "wiki_views": day.views,
            "reddit_comments": reddit_comments,
            "reddit_upvotes": reddit_upvotes,
            "reddit_observed": reddit_stats.is_some()
        })];

        if let Err(e) = batch_record_daily_telemetry(client, config, telemetry_batch) {
            eprintln!(
                "❌ Failed batch recording daily telemetry for '{}': {}",
                show.title, e
            );
            fetch_failures += 1;
            continue;
        }

        // Run Anomaly / Breakout Detection for wiki_views and reddit_comments
        let history = fetch_series_signal_history(client, config, show_id, &recorded_date, 14);
        let today_wiki = day.views;
        let today_reddit = reddit_stats.map(|(comments, _)| comments);

        if let Some(wiki_breakout) = detect_signal_breakout(
            &history.wiki_views,
            today_wiki,
            "wiki_views",
            WIKI_VIEWS_FLOOR,
        ) {
            println!(
                "🔥 Statistical Breakout (Wiki) for '{}': {} ({} vs baseline {:.0})",
                show.title, wiki_breakout.reason, wiki_breakout.value, wiki_breakout.baseline_mean
            );
            if let Err(e) =
                record_series_breakout(client, config, show_id, &recorded_date, &wiki_breakout)
            {
                eprintln!("⚠️  Could not record breakout for '{}': {}", show.title, e);
            } else {
                breakouts_flagged += 1;
            }
        }

        if let Some(reddit_breakout) = today_reddit.and_then(|value| {
            detect_signal_breakout(
                &history.reddit_comments,
                value,
                "reddit_comments",
                REDDIT_COMMENTS_FLOOR,
            )
        }) {
            println!(
                "🔥 Statistical Breakout (Reddit) for '{}': {} ({} vs baseline {:.0})",
                show.title,
                reddit_breakout.reason,
                reddit_breakout.value,
                reddit_breakout.baseline_mean
            );
            if let Err(e) =
                record_series_breakout(client, config, show_id, &recorded_date, &reddit_breakout)
            {
                eprintln!("⚠️  Could not record breakout for '{}': {}", show.title, e);
            } else {
                breakouts_flagged += 1;
            }
        }

        updated_count += 1;
        println!("✓ {}: recorded telemetry for {}", show.title, recorded_date);
        thread::sleep(Duration::from_millis(600));
    }

    println!(
        "\nSync complete. Successfully updated: {}/{}. Failures: {}. Breakouts flagged: {}.",
        updated_count,
        shows.len(),
        fetch_failures,
        breakouts_flagged
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
        update_sync_run(client, config, id, &update);
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

    Ok(updated_count)
}
