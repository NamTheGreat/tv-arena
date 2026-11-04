use anyhow::{bail, Context, Result};
use chrono::{Duration, NaiveDate, Utc};
use serde_json::json;
use std::{thread, time::Duration as StdDuration};

use crate::clients::http::create_http_client;
use crate::clients::supabase::{fetch_series, insert_backfill_telemetry};
use crate::config::Config;
use crate::models::{SeriesRow, WikiDay, WikiPageviews};

fn date_range(days: u32) -> Result<(NaiveDate, NaiveDate)> {
    if !(1..=90).contains(&days) {
        bail!("--days must be between 1 and 90");
    }
    let end = Utc::now().date_naive() - Duration::days(1);
    let start = end - Duration::days(i64::from(days - 1));
    Ok((start, end))
}

fn fetch_pageviews(
    client: &ureq::Agent,
    wiki_slug: &str,
    start: NaiveDate,
    end: NaiveDate,
) -> Result<Vec<WikiDay>> {
    let start_str = format!("{}00", start.format("%Y%m%d"));
    let end_str = format!("{}00", end.format("%Y%m%d"));
    let url = format!(
        "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/{}/daily/{}/{}",
        urlencoding::encode(wiki_slug), start_str, end_str
    );
    let mut last_error = String::new();
    for attempt in 0..3 {
        match client
            .get(&url)
            .set(
                "User-Agent",
                "TVArenaRust/1.0 (https://github.com/NamTheGreat/tv-arena)",
            )
            .call()
        {
            Ok(response) => {
                let data: WikiPageviews = response
                    .into_json()
                    .context("Failed to parse Wikimedia pageview response")?;
                return data
                    .items
                    .context("Wikimedia pageview response omitted items");
            }
            Err(ureq::Error::Status(code, response)) => {
                last_error = format!("Wikimedia returned HTTP {code}");
                if code != 429 && code < 500 {
                    let body = response.into_string().unwrap_or_default();
                    bail!("{last_error}: {body}");
                }
            }
            Err(error) => last_error = error.to_string(),
        }
        if attempt < 2 {
            let seconds = 1_u64 << attempt;
            thread::sleep(StdDuration::from_secs(seconds));
        }
    }
    bail!("Wikimedia fetch failed after 3 attempts: {last_error}")
}

fn telemetry_rows(series_id: &str, days: Vec<WikiDay>) -> Result<Vec<serde_json::Value>> {
    days.into_iter()
        .map(|day| {
            if day.timestamp.len() < 8 {
                bail!("Invalid Wikimedia timestamp: {}", day.timestamp);
            }
            let date = NaiveDate::parse_from_str(&day.timestamp[..8], "%Y%m%d")
                .with_context(|| format!("Invalid Wikimedia timestamp: {}", day.timestamp))?;
            Ok(json!({
                "series_id": series_id,
                "recorded_date": date.format("%Y-%m-%d").to_string(),
                "wiki_views": day.views,
                "reddit_comments": null,
                "reddit_upvotes": null,
                "reddit_observed": false
            }))
        })
        .collect()
}

fn select_series(mut shows: Vec<SeriesRow>, slug: Option<&str>) -> Result<Vec<SeriesRow>> {
    if let Some(slug) = slug {
        shows.retain(|show| show.slug == slug);
        if shows.is_empty() {
            bail!("No series found with slug '{slug}'");
        }
    }
    Ok(shows)
}

pub fn run_backfill(config: &Config, days: u32, slug: Option<&str>) -> Result<()> {
    let (start, end) = date_range(days)?;
    let client = create_http_client();
    let shows = select_series(fetch_series(&client, config)?, slug)?;
    println!(
        "Backfilling Wikipedia pageviews for {} series from {} through {} ({} days).",
        shows.len(),
        start,
        end,
        days
    );

    let mut succeeded = 0;
    let mut failures = Vec::new();
    for show in shows {
        let Some(series_id) = show.id.as_deref() else {
            failures.push(format!("{}: missing series id", show.slug));
            continue;
        };
        match fetch_pageviews(&client, &show.wiki_slug, start, end)
            .and_then(|items| telemetry_rows(series_id, items))
            .and_then(|rows| insert_backfill_telemetry(&client, config, rows))
        {
            Ok(()) => {
                succeeded += 1;
                println!("✓ Backfilled {} ({})", show.title, show.slug);
            }
            Err(error) => {
                eprintln!(
                    "⚠️  Failed backfilling {} ({}): {error:#}",
                    show.title, show.slug
                );
                failures.push(show.slug);
            }
        }
        thread::sleep(StdDuration::from_millis(250));
    }

    if failures.is_empty() {
        println!("✓ Backfill complete for all {succeeded} series.");
        Ok(())
    } else {
        bail!(
            "Backfill completed with {succeeded} successes and {} failures: {}. Re-run safely to retry missing dates.",
            failures.len(),
            failures.join(", ")
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_day_counts_outside_one_to_ninety() {
        assert!(date_range(0).is_err());
        assert!(date_range(91).is_err());
        assert!(date_range(90).is_ok());
    }

    #[test]
    fn maps_wikipedia_dates_and_leaves_reddit_unobserved() {
        let rows = telemetry_rows(
            "series-id",
            vec![WikiDay {
                timestamp: "2026110300".to_string(),
                views: 1234,
            }],
        )
        .unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["recorded_date"], "2026-11-03");
        assert_eq!(rows[0]["wiki_views"], 1234);
        assert!(rows[0]["reddit_comments"].is_null());
        assert!(rows[0]["reddit_upvotes"].is_null());
        assert_eq!(rows[0]["reddit_observed"], false);
    }
}
