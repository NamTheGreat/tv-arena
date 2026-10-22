use anyhow::Result;
use std::{thread, time::Duration};

use crate::clients::http::create_http_client;
use crate::clients::supabase::{batch_record_series_events, fetch_series};
use crate::clients::tmdb::fetch_show_events;
use crate::config::Config;

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

    let mut total_events_recorded = 0;

    for show in &shows {
        let Some(ref show_id) = show.id else { continue };

        println!(
            "Fetching TMDb events for '{}' (ID: {})...",
            show.title, show.tmdb_id
        );

        match fetch_show_events(&client, api_key, show.tmdb_id.into()) {
            Ok(events) => {
                if events.is_empty() {
                    println!("  No aired episode milestones discovered.");
                } else {
                    let count = events.len();
                    if let Err(e) = batch_record_series_events(&client, config, show_id, &events) {
                        eprintln!("  ⚠️  Failed to record events in Supabase: {}", e);
                    } else {
                        println!("  ✓ Recorded {} events for '{}'", count, show.title);
                        total_events_recorded += count;
                    }
                }
            }
            Err(e) => {
                eprintln!(
                    "  ⚠️  TMDb error for '{}' (tmdb_id: {}): {}",
                    show.title, show.tmdb_id, e
                );
            }
        }

        thread::sleep(Duration::from_millis(300));
    }

    println!(
        "\nEvent ingestion complete. Total milestones recorded: {}.",
        total_events_recorded
    );

    Ok(())
}
