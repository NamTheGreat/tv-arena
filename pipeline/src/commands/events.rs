use anyhow::{bail, Result};
use std::{thread, time::Duration};

use crate::clients::http::create_http_client;
use crate::clients::supabase::{batch_record_series_events, fetch_series};
use crate::clients::tmdb::{fetch_show_events, SeriesEventItem};
use crate::config::Config;
use crate::models::SeriesRow;

#[derive(Debug, Default, PartialEq, Eq)]
pub struct EventIngestionSummary {
    pub total_attempted: usize,
    pub successful_shows: usize,
    pub total_milestones: usize,
    pub failed_shows: Vec<(String, i32, String)>,
}

pub fn ingest_events_for_shows<F, S>(
    shows: &[SeriesRow],
    mut fetch_events_fn: F,
    mut record_events_fn: S,
    delay_ms: u64,
) -> Result<EventIngestionSummary>
where
    F: FnMut(i64) -> Result<Vec<SeriesEventItem>>,
    S: FnMut(&str, &[SeriesEventItem]) -> Result<()>,
{
    let mut summary = EventIngestionSummary {
        total_attempted: shows.len(),
        ..Default::default()
    };

    for show in shows {
        let Some(ref show_id) = show.id else {
            summary.failed_shows.push((
                show.title.clone(),
                show.tmdb_id,
                "Series row is missing its database ID".to_string(),
            ));
            continue;
        };

        println!(
            "Fetching TMDb events for '{}' (ID: {})...",
            show.title, show.tmdb_id
        );

        match fetch_events_fn(show.tmdb_id.into()) {
            Ok(events) => {
                if events.is_empty() {
                    println!("  No aired episode milestones discovered.");
                    summary.successful_shows += 1;
                } else {
                    let count = events.len();
                    if let Err(e) = record_events_fn(show_id, &events) {
                        eprintln!("  ⚠️  Failed to record events in Supabase: {}", e);
                        summary.failed_shows.push((
                            show.title.clone(),
                            show.tmdb_id,
                            format!("Supabase write error: {}", e),
                        ));
                    } else {
                        println!("  ✓ Recorded {} events for '{}'", count, show.title);
                        summary.total_milestones += count;
                        summary.successful_shows += 1;
                    }
                }
            }
            Err(e) => {
                eprintln!(
                    "  ⚠️  TMDb error for '{}' (tmdb_id: {}): {}",
                    show.title, show.tmdb_id, e
                );
                summary.failed_shows.push((
                    show.title.clone(),
                    show.tmdb_id,
                    format!("TMDb fetch error: {}", e),
                ));
            }
        }

        if delay_ms > 0 {
            thread::sleep(Duration::from_millis(delay_ms));
        }
    }

    println!(
        "\nEvent ingestion complete. Attempted: {}, Succeeded: {}, Failed: {}, Total milestones recorded: {}.",
        summary.total_attempted,
        summary.successful_shows,
        summary.failed_shows.len(),
        summary.total_milestones
    );

    if !summary.failed_shows.is_empty() {
        let details = summary
            .failed_shows
            .iter()
            .map(|(title, id, err)| format!("- {} (tmdb_id: {}): {}", title, id, err))
            .collect::<Vec<_>>()
            .join("\n");
        bail!(
            "Event ingestion failed for {} of {} shows:\n{}",
            summary.failed_shows.len(),
            summary.total_attempted,
            details
        );
    }

    Ok(summary)
}

pub fn run_events(config: &Config) -> Result<()> {
    let Some(ref api_key) = config.tmdb_api_key else {
        println!("ℹ️  TMDB_API_KEY is not configured in environment. Skipping event ingestion gracefully.");
        return Ok(());
    };

    let client = create_http_client();
    let shows = fetch_series(&client, config)?;

    if shows.is_empty() {
        println!("ℹ️  No series found in database to ingest events for.");
        return Ok(());
    }

    println!(
        "Ingesting premiere/finale events from TMDb for {} shows...",
        shows.len()
    );

    ingest_events_for_shows(
        &shows,
        |tmdb_id| fetch_show_events(&client, api_key, tmdb_id),
        |show_id, events| batch_record_series_events(&client, config, show_id, events),
        300,
    )?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mock_show(id: &str, title: &str, tmdb_id: i32) -> SeriesRow {
        SeriesRow {
            id: Some(id.to_string()),
            tmdb_id,
            slug: title.to_lowercase().replace(' ', "-"),
            title: title.to_string(),
            network: "HBO".to_string(),
            network_group: "HBO".to_string(),
            genre_group: "Drama".to_string(),
            release_years: "2024".to_string(),
            chart_color: "#000".to_string(),
            wiki_slug: "wiki".to_string(),
            reddit_query: "reddit".to_string(),
        }
    }

    #[test]
    fn test_fully_successful_run_including_empty_milestones() {
        let shows = vec![
            mock_show("show-1", "Show One", 101),
            mock_show("show-2", "Show Two", 102),
        ];

        let summary = ingest_events_for_shows(
            &shows,
            |tmdb_id| {
                if tmdb_id == 101 {
                    Ok(vec![SeriesEventItem {
                        event_date: "2024-01-01".to_string(),
                        kind: "premiere".to_string(),
                        label: "Series Premiere".to_string(),
                        source: "tmdb".to_string(),
                    }])
                } else {
                    Ok(vec![]) // Show Two has no milestones
                }
            },
            |_id, _events| Ok(()),
            0,
        )
        .expect("Ingestion should succeed when all shows succeed or have zero milestones");

        assert_eq!(summary.total_attempted, 2);
        assert_eq!(summary.successful_shows, 2);
        assert_eq!(summary.total_milestones, 1);
        assert!(summary.failed_shows.is_empty());
    }

    #[test]
    fn test_fetch_error_processes_remaining_shows_then_fails() {
        let shows = vec![
            mock_show("show-1", "Failing Show", 101),
            mock_show("show-2", "Passing Show", 102),
        ];

        let mut processed_shows = Vec::new();

        let result = ingest_events_for_shows(
            &shows,
            |tmdb_id| {
                processed_shows.push(tmdb_id);
                if tmdb_id == 101 {
                    anyhow::bail!("TMDb API rate limit / 500 internal error");
                } else {
                    Ok(vec![SeriesEventItem {
                        event_date: "2024-02-01".to_string(),
                        kind: "finale".to_string(),
                        label: "Season Finale".to_string(),
                        source: "tmdb".to_string(),
                    }])
                }
            },
            |_id, _events| Ok(()),
            0,
        );

        assert_eq!(
            processed_shows,
            vec![101, 102],
            "Remaining shows must still be processed when one fails"
        );
        assert!(result.is_err(), "Result must be Err when a show fails");
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("Failing Show"));
        assert!(err_msg.contains("tmdb_id: 101"));
    }

    #[test]
    fn test_supabase_write_error_processes_remaining_shows_then_fails() {
        let shows = vec![
            mock_show("show-1", "Write Fail Show", 201),
            mock_show("show-2", "Passing Show", 202),
        ];

        let result = ingest_events_for_shows(
            &shows,
            |_tmdb_id| {
                Ok(vec![SeriesEventItem {
                    event_date: "2024-03-01".to_string(),
                    kind: "premiere".to_string(),
                    label: "Premiere".to_string(),
                    source: "tmdb".to_string(),
                }])
            },
            |id, _events| {
                if id == "show-1" {
                    anyhow::bail!("Supabase connection timeout");
                }
                Ok(())
            },
            0,
        );

        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("Write Fail Show"));
        assert!(err_msg.contains("Supabase write error"));
    }

    #[test]
    fn test_missing_series_id_fails_the_run() {
        let mut show = mock_show("show-1", "Missing ID Show", 301);
        show.id = None;

        let result = ingest_events_for_shows(&[show], |_| Ok(vec![]), |_, _| Ok(()), 0);

        let err_msg = result
            .expect_err("A show without a database ID must fail the run")
            .to_string();
        assert!(err_msg.contains("Missing ID Show"));
        assert!(err_msg.contains("missing its database ID"));
    }
}
