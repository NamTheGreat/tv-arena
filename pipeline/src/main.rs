use anyhow::{Context, Result};
use chrono::{Duration as ChronoDuration, Utc};
use clap::{Parser, Subcommand};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{cmp::Ordering, env, thread, time::Duration};

#[derive(Parser)]
#[command(name = "tv-arena-pipeline", about = "Rust Seeder & Nightly Scraper for TV Arena")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// One-time: Parse Kaggle CSV, verify Wiki slugs, and seed Supabase
    Seed {
        #[arg(short, long, default_value = "TMDB_tv_dataset_v3.csv")]
        csv: String,
        #[arg(short, long, default_value_t = 200)]
        limit: usize,
    },
    /// Nightly: Fetch 7d Wikipedia + Reddit telemetry and update Supabase scores
    Sync,
}

#[derive(Debug, Deserialize)]
struct KaggleRow {
    id: i32,
    name: String,
    vote_count: f64,
    vote_average: f64,
    popularity: f64,
    networks: String,
    genres: String,
    first_air_date: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct SeriesRow {
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<String>,
    tmdb_id: i32,
    slug: String,
    title: String,
    network: String,
    genre_group: String,
    release_years: String,
    chart_color: String,
    wiki_slug: String,
    reddit_query: String,
    #[serde(default)]
    viewers_premiere_28d: i64,
    #[serde(default)]
    delta_pct: f64,
}

#[derive(Debug, Serialize)]
struct SeedSeriesPayload {
    tmdb_id: i32,
    slug: String,
    title: String,
    network: String,
    genre_group: String,
    release_years: String,
    chart_color: String,
    wiki_slug: String,
    reddit_query: String,
}

#[derive(Deserialize)]
struct WikiPageviews {
    items: Option<Vec<WikiDay>>,
}

#[derive(Deserialize)]
struct WikiDay {
    views: i64,
}

#[derive(Deserialize)]
struct RedditListing {
    data: RedditData,
}

#[derive(Deserialize)]
struct RedditData {
    children: Vec<RedditChild>,
}

#[derive(Deserialize)]
struct RedditChild {
    data: RedditPost,
}

#[derive(Deserialize)]
struct RedditPost {
    num_comments: i64,
    score: i64,
}

const CHART_PALETTE: [&str; 6] = [
    "#C66A3D", "#5C828C", "#C59A44", "#886F99", "#6E8761", "#A65D67",
];

fn main() -> Result<()> {
    dotenvy::dotenv().ok();
    let supabase_url = env::var("SUPABASE_URL").context("Missing SUPABASE_URL")?;
    let supabase_key = env::var("SUPABASE_SERVICE_ROLE_KEY").context("Missing SUPABASE_SERVICE_ROLE_KEY")?;

    let cli = Cli::parse();
    match cli.command {
        Commands::Seed { csv, limit } => run_seed(&csv, limit, &supabase_url, &supabase_key)?,
        Commands::Sync => run_sync(&supabase_url, &supabase_key)?,
    }
    Ok(())
}

fn create_http_client() -> ureq::Agent {
    ureq::builder()
        .timeout_connect(Duration::from_secs(10))
        .timeout_read(Duration::from_secs(15))
        .timeout_write(Duration::from_secs(10))
        .build()
}

fn resolve_wiki_slug(title: &str, client: &ureq::Agent) -> Option<String> {
    let base = title.replace(' ', "_");
    let candidates = [
        format!("{}_(TV_series)", base),
        format!("{}_(American_TV_series)", base),
        base.clone(),
    ];

    for slug in candidates {
        let url = format!(
            "https://en.wikipedia.org/api/rest_v1/page/summary/{}",
            urlencoding::encode(&slug)
        );
        if let Ok(res) = client.get(&url).set("User-Agent", "TVArenaRust/1.0").call() {
            if res.status() == 200 {
                if let Ok(body) = res.into_json::<serde_json::Value>() {
                    if body.get("type").and_then(|t| t.as_str()) == Some("standard") {
                        let desc = body
                            .get("description")
                            .and_then(|d| d.as_str())
                            .unwrap_or("")
                            .to_lowercase();
                        let extract = body
                            .get("extract")
                            .and_then(|e| e.as_str())
                            .unwrap_or("")
                            .to_lowercase();

                        let is_tv = slug.ends_with("_(TV_series)")
                            || slug.ends_with("_(American_TV_series)")
                            || desc.contains("television")
                            || desc.contains("series")
                            || desc.contains("sitcom")
                            || desc.contains("drama")
                            || extract.contains("television series")
                            || extract.contains("tv series");

                        if is_tv {
                            if let Some(canonical) = body
                                .pointer("/titles/canonical")
                                .and_then(|c| c.as_str())
                            {
                                return Some(canonical.to_string());
                            }
                            return Some(slug);
                        }
                    }
                }
            }
        }
    }
    None
}

fn run_seed(csv_path: &str, limit: usize, supabase_url: &str, supabase_key: &str) -> Result<()> {
    let mut rdr = csv::Reader::from_path(csv_path).context("Failed to open Kaggle CSV")?;
    let mut candidates: Vec<KaggleRow> = Vec::new();
    let client = create_http_client();

    let major_nets = [
        "Netflix", "HBO", "Apple TV", "Prime Video", "Amazon", "FX", "Hulu", "Disney+", "AMC",
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

        let endpoint = format!("{}/rest/v1/series?on_conflict=tmdb_id", supabase_url);
        let res = client
            .post(&endpoint)
            .set("apikey", supabase_key)
            .set("Authorization", &format!("Bearer {}", supabase_key))
            .set("Prefer", "resolution=merge-duplicates")
            .send_json(ureq::serde_json::to_value(&payload)?);

        if let Ok(response) = res {
            if response.status() >= 200 && response.status() < 300 {
                seeded += 1;
                println!("[{}/{}] Seeded: {} ({})", seeded, limit, row.name, network);
            }
        }
        thread::sleep(Duration::from_millis(150));
    }
    Ok(())
}

fn run_sync(supabase_url: &str, supabase_key: &str) -> Result<()> {
    let client = create_http_client();
    let list_url = format!("{}/rest/v1/series?select=*&order=viewers_premiere_28d.desc", supabase_url);
    let shows: Vec<SeriesRow> = client
        .get(&list_url)
        .set("apikey", supabase_key)
        .set("Authorization", &format!("Bearer {}", supabase_key))
        .call()?
        .into_json()?;

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

    for show in &shows {
        let Some(show_id) = &show.id else { continue };

        let wiki_url = format!(
            "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/{}/daily/{}/{}",
            urlencoding::encode(&show.wiki_slug),
            start_str,
            end_str
        );

        let wiki_result = client
            .get(&wiki_url)
            .set("User-Agent", "TVArenaRust/1.0 (tv-arena-telemetry)")
            .call();

        let wiki_views: Option<i64> = match wiki_result {
            Ok(r) if r.status() == 200 => r
                .into_json::<WikiPageviews>()
                .ok()
                .and_then(|w| w.items)
                .map(|days| days.iter().map(|d| d.views).sum()),
            Err(e) => {
                eprintln!("⚠️  Wiki fetch error for '{}': {}", show.title, e);
                None
            }
            _ => None,
        };

        let reddit_url = format!(
            "https://www.reddit.com/r/television/search.json?q={}&restrict_sr=1&t=week&limit=100",
            urlencoding::encode(&show.reddit_query)
        );

        let reddit_result = client
            .get(&reddit_url)
            .set("User-Agent", "TVArenaRust/1.0 (tv-arena-telemetry)")
            .call();

        let reddit_stats: Option<(i64, i64)> = match reddit_result {
            Ok(r) if r.status() == 200 => r.into_json::<RedditListing>().ok().map(|l| {
                let c: i64 = l.data.children.iter().map(|p| p.data.num_comments).sum();
                let u: i64 = l.data.children.iter().map(|p| p.data.score).sum();
                (c, u)
            }),
            Err(e) => {
                eprintln!("⚠️  Reddit fetch error for '{}': {}", show.title, e);
                None
            }
            _ => None,
        };

        // If both sources failed or throttled, DO NOT store fake 0s. Skip this show and retain previous valid telemetry.
        if wiki_views.is_none() && reddit_stats.is_none() {
            eprintln!(
                "❌ Both Wikipedia and Reddit failed for '{}'. Skipping to preserve historical scores.",
                show.title
            );
            fetch_failures += 1;
            continue;
        }

        let total_wiki = wiki_views.unwrap_or(0);
        let (total_comments, total_upvotes) = reddit_stats.unwrap_or((0, 0));

        let new_score = (total_wiki * 10) + (total_comments * 150) + (total_upvotes * 25);
        let prev_score = if show.viewers_premiere_28d > 0 {
            show.viewers_premiere_28d
        } else {
            new_score
        };

        let raw_delta = if prev_score > 0 {
            (((new_score - prev_score) as f64 / prev_score as f64) * 1000.0).round() / 10.0
        } else {
            0.0
        };
        // Clamp delta to prevent NUMERIC overflow
        let delta_pct = raw_delta.clamp(-99999.0, 99999.0);

        let patch_url = format!("{}/rest/v1/series?id=eq.{}", supabase_url, show_id);
        let patch_res = client
            .patch(&patch_url)
            .set("apikey", supabase_key)
            .set("Authorization", &format!("Bearer {}", supabase_key))
            .send_json(json!({
                "viewers_premiere_28d": new_score,
                "delta_pct": delta_pct,
                "updated_at": Utc::now().to_rfc3339()
            }));

        if let Err(e) = patch_res {
            eprintln!("❌ Failed updating series row for '{}': {}", show.title, e);
            fetch_failures += 1;
            continue;
        }

        let telemetry_url = format!(
            "{}/rest/v1/series_daily_telemetry?on_conflict=series_id,recorded_date",
            supabase_url
        );
        let telemetry_res = client
            .post(&telemetry_url)
            .set("apikey", supabase_key)
            .set("Authorization", &format!("Bearer {}", supabase_key))
            .set("Prefer", "resolution=merge-duplicates")
            .send_json(json!({
                "series_id": show_id,
                "recorded_date": recorded_date,
                "daily_viewers": new_score / 7,
                "wiki_views": total_wiki,
                "reddit_comments": total_comments
            }));

        if let Err(e) = telemetry_res {
            eprintln!("❌ Failed recording daily telemetry for '{}': {}", show.title, e);
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

    // Fail the run if over 40% of shows failed to sync so GitHub Actions alerts accurately
    if !shows.is_empty() && fetch_failures > (shows.len() * 4 / 10) {
        anyhow::bail!(
            "Sync failed: too many telemetry fetch errors ({}/{} shows failed)",
            fetch_failures,
            shows.len()
        );
    }

    Ok(())
}
