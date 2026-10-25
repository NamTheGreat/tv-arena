use anyhow::{Context, Result};
use serde::Deserialize;
use std::{cmp::Ordering, collections::HashSet, thread, time::Duration};

use crate::clients::http::create_http_client;
use crate::clients::supabase::{fetch_series, upsert_seed_series};
use crate::clients::wikipedia::resolve_wiki_slug;
use crate::config::{Config, CHART_PALETTE};
use crate::models::{KaggleRow, SeedSeriesPayload};

// ponytail: minimal TMDb response structs, only fields we actually read
#[derive(Debug, Deserialize)]
struct TmdbDiscoverResponse {
    results: Vec<TmdbDiscoverItem>,
    total_pages: i32,
}

#[derive(Debug, Deserialize)]
struct TmdbDiscoverItem {
    id: i32,
    name: String,
    first_air_date: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TmdbTvDetail {
    networks: Option<Vec<TmdbEntity>>,
    genres: Option<Vec<TmdbEntity>>,
    status: Option<String>,
    last_air_date: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TmdbEntity {
    name: String,
}

/// Auto-discover prestige TV from TMDb API, or fall back to CSV if `--csv` provided.
pub fn run_seed(csv_path: Option<&str>, limit: usize, config: &Config) -> Result<()> {
    match csv_path {
        Some(path) => run_csv_seed(path, limit, config),
        None => run_tmdb_discover(limit, config),
    }
}

/// TMDb auto-discover: pages /discover/tv sorted by vote_count.desc, verifies Wikipedia slugs,
/// upserts into Supabase with ignore-duplicates so existing telemetry is never touched.
fn run_tmdb_discover(limit: usize, config: &Config) -> Result<()> {
    let tmdb_key = config
        .tmdb_api_key
        .as_ref()
        .context("TMDB_API_KEY not set. Add it to .env or environment.")?;

    let client = create_http_client();

    // Pre-fetch existing tmdb_ids so we skip detail+wiki calls for shows already in DB
    let existing = fetch_series(&client, config).unwrap_or_default();
    let mut seen_ids: HashSet<i32> = existing.iter().map(|s| s.tmdb_id).collect();
    let mut seen_slugs: HashSet<String> = existing.iter().map(|s| s.slug.clone()).collect();

    println!(
        "Found {} existing series in Supabase. Discovering up to {} new shows via TMDb...",
        seen_ids.len(),
        limit
    );

    let mut seeded = 0;
    let mut page = 1;
    // ponytail: 25 pages × 20 results = 500 candidates, plenty for 200 limit
    let max_pages = 25;
    let mut retry_count = 0;
    const MAX_RETRIES_PER_PAGE: u32 = 3;
    let auth_header = format!("Bearer {}", tmdb_key);

    while seeded < limit && page <= max_pages {
        // Exclude: 10762 (Kids), 10763 (News), 10764 (Reality), 10766 (Soap), 10767 (Talk)
        let url = format!(
            "https://api.themoviedb.org/3/discover/tv\
             ?language=en-US\
             &sort_by=vote_count.desc\
             &vote_average.gte=7.0\
             &vote_count.gte=800\
             &without_genres=10762,10763,10764,10766,10767\
             &with_original_language=en\
             &page={}",
            page
        );

        let res = match client
            .get(&url)
            .query("api_key", tmdb_key)
            .set("Authorization", &auth_header)
            .set("Accept", "application/json")
            .call()
        {
            Ok(r) => {
                retry_count = 0;
                r
            }
            Err(ureq::Error::Status(status, _resp)) => {
                if status == 401 || status == 403 {
                    anyhow::bail!(
                        "TMDb authentication failed (HTTP {}). Please check TMDB_API_KEY.",
                        status
                    );
                }
                retry_count += 1;
                if retry_count >= MAX_RETRIES_PER_PAGE {
                    eprintln!(
                        "⚠️  Failed to fetch TMDb page {} after {} attempts (HTTP {}). Skipping to next page.",
                        page, retry_count, status
                    );
                    page += 1;
                    retry_count = 0;
                    continue;
                }
                eprintln!(
                    "⚠️  TMDb error HTTP {} on page {}, retrying ({}/{})...",
                    status, page, retry_count, MAX_RETRIES_PER_PAGE
                );
                thread::sleep(Duration::from_secs(retry_count as u64));
                continue;
            }
            Err(e) => {
                retry_count += 1;
                if retry_count >= MAX_RETRIES_PER_PAGE {
                    eprintln!(
                        "⚠️  Network error on page {} after {} attempts: {}. Skipping to next page.",
                        page, retry_count, e
                    );
                    page += 1;
                    retry_count = 0;
                    continue;
                }
                eprintln!(
                    "⚠️  Network error on page {}, retrying ({}/{})...",
                    page, retry_count, MAX_RETRIES_PER_PAGE
                );
                thread::sleep(Duration::from_secs(retry_count as u64));
                continue;
            }
        };

        let Ok(data) = res.into_json::<TmdbDiscoverResponse>() else {
            break;
        };

        for item in &data.results {
            if seeded >= limit {
                break;
            }
            if seen_ids.contains(&item.id) {
                continue;
            }

            // Fetch show details for network + genre + status
            let detail_url = format!("https://api.themoviedb.org/3/tv/{}?language=en-US", item.id);
            let Ok(detail_res) = client
                .get(&detail_url)
                .query("api_key", tmdb_key)
                .set("Authorization", &auth_header)
                .set("Accept", "application/json")
                .call()
            else {
                continue;
            };
            let Ok(detail) = detail_res.into_json::<TmdbTvDetail>() else {
                continue;
            };

            let raw_network = detail
                .networks
                .as_ref()
                .and_then(|n| n.first())
                .map(|n| n.name.as_str())
                .unwrap_or("Streaming");
            let network = normalize_network(raw_network);

            let genre_names: Vec<&str> = detail
                .genres
                .as_ref()
                .map(|g| g.iter().map(|e| e.name.as_str()).collect())
                .unwrap_or_default();
            let genre_group = classify_genre(&genre_names);

            // Verify Wikipedia slug exists for nightly telemetry scraper
            let Some(wiki_slug) = resolve_wiki_slug(&item.name, &client) else {
                println!(
                    "  ⏭️  Skipping '{}' (no Wikipedia article found)",
                    item.name
                );
                continue;
            };

            let mut slug = slugify(&item.name);
            // ponytail: simple collision avoidance, append tmdb_id if slug taken
            if seen_slugs.contains(&slug) {
                slug = format!("{}-{}", slug, item.id);
            }

            let start_year = item
                .first_air_date
                .as_deref()
                .and_then(|d| d.get(0..4))
                .unwrap_or("2020");
            let end_part = if detail.status.as_deref() == Some("Ended")
                || detail.status.as_deref() == Some("Canceled")
            {
                detail
                    .last_air_date
                    .as_deref()
                    .and_then(|d| d.get(0..4))
                    .unwrap_or(start_year)
            } else {
                "present"
            };
            let release_years = if start_year == end_part {
                start_year.to_string()
            } else {
                format!("{}–{}", start_year, end_part)
            };

            let color_idx = (seen_ids.len() + seeded) % CHART_PALETTE.len();
            let payload = SeedSeriesPayload {
                tmdb_id: item.id,
                slug: slug.clone(),
                title: item.name.clone(),
                network: network.clone(),
                genre_group,
                release_years,
                chart_color: CHART_PALETTE[color_idx].to_string(),
                wiki_slug,
                reddit_query: format!("\"{}\" ({} OR episode OR season)", item.name, network),
            };

            // ponytail: reuse existing upsert_seed_series; it uses merge-duplicates
            // which is fine because we pre-filter seen_ids so this only fires for genuinely new rows
            if upsert_seed_series(&client, config, &payload)? {
                seen_ids.insert(item.id);
                seen_slugs.insert(slug);
                seeded += 1;
                println!(
                    "✅ [{}/{}] Seeded: {} ({} | {})",
                    seeded, limit, item.name, network, payload.wiki_slug
                );
            }

            // Respect TMDb rate limit (~40 req/10s) + Wikipedia politeness
            thread::sleep(Duration::from_millis(200));
        }

        if page >= data.total_pages {
            break;
        }
        page += 1;
    }

    println!("\n🎉 Finished seeding {} new series into Supabase!", seeded);
    Ok(())
}

/// Legacy CSV seed path — kept as fallback via `--csv <file>`.
fn run_csv_seed(csv_path: &str, limit: usize, config: &Config) -> Result<()> {
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

        let slug = slugify(&row.name);

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

fn normalize_network(raw: &str) -> String {
    let lower = raw.to_lowercase();
    if lower.contains("netflix") {
        "Netflix".to_string()
    } else if lower.contains("hbo") || lower == "max" {
        "HBO".to_string()
    } else if lower.contains("apple") {
        "Apple TV+".to_string()
    } else if lower.contains("prime") || lower.contains("amazon") {
        "Prime Video".to_string()
    } else if lower.contains("fx") || lower.contains("hulu") {
        "FX / Hulu".to_string()
    } else if lower.contains("disney") {
        "Disney+".to_string()
    } else if lower.contains("amc") {
        "AMC".to_string()
    } else if lower.contains("showtime") || lower.contains("paramount") {
        "Paramount+".to_string()
    } else if lower.contains("bbc") {
        "BBC".to_string()
    } else if lower.contains("peacock") || lower.contains("nbc") {
        "Peacock".to_string()
    } else {
        raw.to_string()
    }
}

fn classify_genre(genres: &[&str]) -> String {
    let joined = genres.join(" ").to_lowercase();
    if joined.contains("sci-fi") || joined.contains("fantasy") || joined.contains("science fiction")
    {
        "Drama & Sci-Fi".to_string()
    } else if joined.contains("comedy") {
        "Comedy & Drama".to_string()
    } else if joined.contains("crime") || joined.contains("mystery") {
        "Crime & Mystery".to_string()
    } else {
        "Drama".to_string()
    }
}

fn slugify(title: &str) -> String {
    title
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}
