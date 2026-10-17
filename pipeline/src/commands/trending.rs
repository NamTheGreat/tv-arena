use anyhow::Result;
use chrono::{Duration as ChronoDuration, Utc};
use serde_json::json;
use std::{collections::HashSet, thread, time::Duration};

use crate::clients::http::create_http_client;
use crate::clients::supabase::{
    batch_record_daily_telemetry, fetch_series, patch_series_score, upsert_seed_series,
};
use crate::clients::tmdb::{fetch_trending_tv, fetch_tv_detail};
use crate::clients::wikipedia::{fetch_wiki_days, resolve_wiki_slug};
use crate::config::{Config, CHART_PALETTE};
use crate::engine::compute_buzz_score;
use crate::models::SeedSeriesPayload;

pub fn run_trending_sync(
    config: &Config,
    min_popularity: f64,
    min_vote_count: f64,
    limit: usize,
) -> Result<()> {
    let Some(ref tmdb_key) = config.tmdb_api_key else {
        println!(
            "ℹ️  TMDB_API_KEY is not configured in .env or environment.\n\
             To enable automated weekly TMDB trending series discovery, add:\n\
             TMDB_API_KEY=your_api_key\n\
             to your .env file or GitHub Secrets (obtainable free at https://www.themoviedb.org/settings/api)."
        );
        return Ok(());
    };

    let client = create_http_client();
    println!("Fetching weekly trending TV series from TMDB API...");

    let trending_resp = fetch_trending_tv(&client, tmdb_key, 1)?;
    let existing_series = fetch_series(&client, config)?;
    let existing_ids: HashSet<i32> = existing_series.iter().map(|s| s.tmdb_id).collect();

    let candidates: Vec<_> = trending_resp
        .results
        .into_iter()
        .filter(|show| {
            show.popularity >= min_popularity
                && show.vote_count >= min_vote_count
                && !existing_ids.contains(&show.id)
        })
        .take(limit)
        .collect();

    if candidates.is_empty() {
        println!("ℹ️  No new trending television series met the ingestion thresholds (min popularity: {}, min votes: {}).", min_popularity, min_vote_count);
        return Ok(());
    }

    println!(
        "Discovered {} potential trending candidate(s) to ingest into TV Arena...",
        candidates.len()
    );

    let now = Utc::now();
    let yesterday = now - ChronoDuration::days(1);
    let start_date = yesterday - ChronoDuration::days(6);
    let start_str = start_date.format("%Y%m%d00").to_string();
    let end_str = yesterday.format("%Y%m%d00").to_string();
    let _recorded_date = yesterday.format("%Y-%m-%d").to_string();

    let mut added_count = 0;

    for (idx, show) in candidates.into_iter().enumerate() {
        println!(
            "\nEvaluating: '{}' (TMDB ID: {}, Popularity: {:.1}, Votes: {})",
            show.name, show.id, show.popularity, show.vote_count
        );

        let Some(wiki_slug) = resolve_wiki_slug(&show.name, &client) else {
            println!(
                "  ⚠️  Could not resolve Wikipedia article for '{}', skipping.",
                show.name
            );
            continue;
        };

        // Fetch detailed network and genre information
        let detail = fetch_tv_detail(&client, tmdb_key, show.id).ok();

        let network = detail
            .as_ref()
            .and_then(|d| d.networks.first())
            .map(|n| n.name.clone())
            .unwrap_or_else(|| "Streaming".to_string());

        let genres_str: Vec<String> = detail
            .as_ref()
            .map(|d| d.genres.iter().map(|g| g.name.clone()).collect())
            .unwrap_or_default();

        let genre_group = if genres_str
            .iter()
            .any(|g| g.contains("Sci-Fi") || g.contains("Fantasy"))
        {
            "Drama & Sci-Fi".to_string()
        } else if genres_str.iter().any(|g| g.contains("Comedy")) {
            "Comedy & Drama".to_string()
        } else if genres_str
            .iter()
            .any(|g| g.contains("Crime") || g.contains("Mystery"))
        {
            "Crime & Mystery".to_string()
        } else if genres_str.iter().any(|g| g.contains("Drama")) {
            "Drama".to_string()
        } else {
            genres_str
                .first()
                .cloned()
                .unwrap_or_else(|| "Drama".to_string())
        };

        let slug = show
            .name
            .to_lowercase()
            .chars()
            .map(|c| if c.is_alphanumeric() { c } else { '-' })
            .collect::<String>()
            .split('-')
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("-");

        let release_year = show
            .first_air_date
            .as_deref()
            .unwrap_or("2024")
            .chars()
            .take(4)
            .collect::<String>();

        let color = CHART_PALETTE[(existing_ids.len() + idx) % CHART_PALETTE.len()].to_string();

        let payload = SeedSeriesPayload {
            tmdb_id: show.id,
            slug: slug.clone(),
            title: show.name.clone(),
            network: network.clone(),
            genre_group,
            release_years: format!("{}–present", release_year),
            chart_color: color,
            wiki_slug: wiki_slug.clone(),
            reddit_query: format!("\"{}\" ({} OR episode OR season)", show.name, network),
        };

        if !upsert_seed_series(&client, config, &payload)? {
            println!("  ❌ Failed inserting series record for '{}'", show.name);
            continue;
        }

        println!(
            "  ✓ Ingested new series: '{}' ({}) -> slug: '{}', wiki: '{}'",
            show.name, network, slug, wiki_slug
        );

        // Fetch initial telemetry so new show is charted immediately
        let wiki_days = fetch_wiki_days(&client, &wiki_slug, &start_str, &end_str, &show.name);
        if let Some(ref days) = wiki_days {
            let total_wiki: i64 = days.iter().map(|d| d.views).sum();
            let score = compute_buzz_score(total_wiki, 0, 0);

            // Fetch newly inserted series ID from Supabase
            let check_url = format!(
                "{}/rest/v1/series?tmdb_id=eq.{}&select=id",
                config.supabase_url, show.id
            );
            if let Ok(res) = client
                .get(&check_url)
                .set("apikey", &config.supabase_key)
                .set("Authorization", &format!("Bearer {}", config.supabase_key))
                .call()
            {
                if let Ok(rows) = res.into_json::<Vec<serde_json::Value>>() {
                    if let Some(show_id) = rows
                        .first()
                        .and_then(|r| r.get("id"))
                        .and_then(|v| v.as_str())
                    {
                        let _ = patch_series_score(&client, config, show_id, score, 0.0);

                        let mut telemetry_batch = Vec::new();
                        for day in days {
                            if day.timestamp.len() >= 8 {
                                let date_iso = format!(
                                    "{}-{}-{}",
                                    &day.timestamp[0..4],
                                    &day.timestamp[4..6],
                                    &day.timestamp[6..8]
                                );
                                telemetry_batch.push(json!({
                                    "series_id": show_id,
                                    "recorded_date": date_iso,
                                    "daily_viewers": compute_buzz_score(day.views, 0, 0),
                                    "wiki_views": day.views,
                                    "reddit_comments": 0
                                }));
                            }
                        }
                        if !telemetry_batch.is_empty() {
                            let _ = batch_record_daily_telemetry(&client, config, telemetry_batch);
                        }
                    }
                }
            }
        }

        added_count += 1;
        thread::sleep(Duration::from_millis(350));
    }

    println!(
        "\nTrending ingestion complete! Added {} new series to the Arena.",
        added_count
    );
    Ok(())
}
