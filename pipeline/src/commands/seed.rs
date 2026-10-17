use anyhow::{Context, Result};
use std::{cmp::Ordering, thread, time::Duration};

use crate::clients::http::create_http_client;
use crate::clients::supabase::upsert_seed_series;
use crate::clients::wikipedia::resolve_wiki_slug;
use crate::config::{Config, CHART_PALETTE};
use crate::models::{KaggleRow, SeedSeriesPayload};

pub fn run_seed(csv_path: &str, limit: usize, config: &Config) -> Result<()> {
    let mut rdr = csv::Reader::from_path(csv_path).context("Failed to open Kaggle CSV")?;
    let mut candidates: Vec<KaggleRow> = Vec::new();
    let client = create_http_client();

    let major_nets = [
        "Netflix",
        "HBO",
        "Apple TV",
        "Prime Video",
        "Amazon",
        "FX",
        "Hulu",
        "Disney+",
        "AMC",
    ];
    let bad_genres = ["Talk", "News", "Reality", "Soap", "Kids"];

    for result in rdr.deserialize::<KaggleRow>() {
        let Ok(row) = result else { continue };

        let has_major_net = major_nets.iter().any(|n| row.networks.contains(n))
            || row
                .networks
                .split(',')
                .any(|n| n.trim() == "Max" || n.trim() == "HBO Max");
        let has_bad_genre = bad_genres.iter().any(|g| row.genres.contains(g));

        if row.vote_count >= 1500.0 && row.vote_average >= 7.0 && has_major_net && !has_bad_genre {
            candidates.push(row);
        }
    }

    candidates.sort_by(|a, b| {
        b.popularity
            .partial_cmp(&a.popularity)
            .unwrap_or(Ordering::Equal)
    });

    let mut seeded = 0;
    for (idx, row) in candidates.into_iter().enumerate() {
        if seeded >= limit {
            break;
        }
        let Some(wiki_slug) = resolve_wiki_slug(&row.name, &client) else {
            continue;
        };

        let network = row
            .networks
            .split(',')
            .next()
            .unwrap_or("Streaming")
            .trim()
            .to_string();

        let slug = row
            .name
            .to_lowercase()
            .chars()
            .map(|c| if c.is_alphanumeric() { c } else { '-' })
            .collect::<String>()
            .split('-')
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("-");

        let genre_group = if row.genres.contains("Sci-Fi") || row.genres.contains("Fantasy") {
            "Drama & Sci-Fi".to_string()
        } else if row.genres.contains("Comedy") {
            "Comedy & Drama".to_string()
        } else if row.genres.contains("Drama") {
            "Drama".to_string()
        } else {
            row.genres
                .split(',')
                .next()
                .unwrap_or("Drama")
                .trim()
                .to_string()
        };

        // Note: We omit viewers_premiere_28d and delta_pct so re-running seed does NOT overwrite live scores
        let payload = SeedSeriesPayload {
            tmdb_id: row.id,
            slug,
            title: row.name.clone(),
            network: network.clone(),
            genre_group,
            release_years: row.first_air_date.chars().take(4).collect(),
            chart_color: CHART_PALETTE[idx % CHART_PALETTE.len()].to_string(),
            wiki_slug,
            reddit_query: format!("\"{}\" ({} OR episode OR season)", row.name, network),
        };

        if upsert_seed_series(&client, config, &payload)? {
            seeded += 1;
            println!("[{}/{}] Seeded: {} ({})", seeded, limit, row.name, network);
        }
        thread::sleep(Duration::from_millis(150));
    }
    Ok(())
}
