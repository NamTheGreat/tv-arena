use anyhow::{Context, Result};
use chrono::{Duration as ChronoDuration, Utc};
use clap::{Parser, Subcommand};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{env, thread, time::Duration};

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
    viewers_premiere_28d: i64,
    delta_pct: f64,
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

fn resolve_wiki_slug(title: &str) -> Option<String> {
    let base = title.replace(' ', "_");
    let candidates = [format!("{}_(TV_series)", base), base];

    for slug in candidates {
        let url = format!("https://en.wikipedia.org/api/rest_v1/page/summary/{}", urlencoding::encode(&slug));
        if let Ok(res) = ureq::get(&url).set("User-Agent", "TVArenaRust/1.0").call() {
            if res.status() == 200 {
                if let Ok(body) = res.into_json::<serde_json::Value>() {
                    if body.get("type").and_then(|t| t.as_str()) == Some("standard") {
                        return Some(slug);
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

    let major_nets = ["Netflix", "HBO", "Apple TV", "Prime Video", "Amazon", "FX", "Hulu", "Disney+", "AMC", "Max"];
    let bad_genres = ["Talk", "News", "Reality", "Soap", "Kids"];

    for result in rdr.deserialize::<KaggleRow>() {
        let Ok(row) = result else { continue };
        let has_major_net = major_nets.iter().any(|n| row.networks.contains(n));
        let has_bad_genre = bad_genres.iter().any(|g| row.genres.contains(g));

        if row.vote_count >= 1500.0 && row.vote_average >= 7.0 && has_major_net && !has_bad_genre {
            candidates.push(row);
        }
    }

    candidates.sort_by(|a, b| b.popularity.partial_cmp(&a.popularity).unwrap());

    let mut seeded = 0;
    for (idx, row) in candidates.into_iter().enumerate() {
        if seeded >= limit {
            break;
        }
        let Some(wiki_slug) = resolve_wiki_slug(&row.name) else { continue };

        let network = row.networks.split(',').next().unwrap_or("Streaming").trim().to_string();
        let slug = row.name.to_lowercase()
            .chars()
            .map(|c| if c.is_alphanumeric() { c } else { '-' })
            .collect::<String>()
            .split('-')
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("-");

        let payload = SeriesRow {
            id: None,
            tmdb_id: row.id,
            slug,
            title: row.name.clone(),
            network: network.clone(),
            genre_group: "Drama & Sci-Fi".to_string(),
            release_years: row.first_air_date.chars().take(4).collect(),
            chart_color: CHART_PALETTE[idx % CHART_PALETTE.len()].to_string(),
            wiki_slug,
            reddit_query: format!("\"{}\" ({} OR episode OR season)", row.name, network),
            viewers_premiere_28d: 0,
            delta_pct: 0.0,
        };

        let endpoint = format!("{}/rest/v1/series?on_conflict=tmdb_id", supabase_url);
        let res = ureq::post(&endpoint)
            .set("apikey", supabase_key)
            .set("Authorization", &format!("Bearer {}", supabase_key))
            .set("Prefer", "resolution=merge-duplicates")
            .send_json(ureq::serde_json::to_value(&payload)?);

        if res.is_ok() {
            seeded += 1;
            println!("[{}/{}] Seeded: {} ({})", seeded, limit, row.name, network);
        }
        thread::sleep(Duration::from_millis(150));
    }
    Ok(())
}

fn run_sync(supabase_url: &str, supabase_key: &str) -> Result<()> {
    let list_url = format!("{}/rest/v1/series?select=*", supabase_url);
    let shows: Vec<SeriesRow> = ureq::get(&list_url)
        .set("apikey", supabase_key)
        .set("Authorization", &format!("Bearer {}", supabase_key))
        .call()?
        .into_json()?;

    let now = Utc::now();
    let start_str = (now - ChronoDuration::days(7)).format("%Y%m%d00").to_string();
    let end_str = now.format("%Y%m%d00").to_string();
    let today_iso = now.format("%Y-%m-%d").to_string();

    println!("Syncing {} shows for window {} -> {}...", shows.len(), start_str, end_str);

    for show in shows {
        let Some(show_id) = &show.id else { continue };

        let wiki_url = format!(
            "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/{}/daily/{}/{}",
            urlencoding::encode(&show.wiki_slug),
            start_str,
            end_str
        );
        let wiki_views: i64 = ureq::get(&wiki_url)
            .set("User-Agent", "TVArenaRust/1.0")
            .call()
            .ok()
            .and_then(|r| r.into_json::<WikiPageviews>().ok())
            .and_then(|w| w.items)
            .map(|days| days.iter().map(|d| d.views).sum())
            .unwrap_or(0);

        let reddit_url = format!(
            "https://www.reddit.com/r/television/search.json?q={}&restrict_sr=1&t=week&limit=100",
            urlencoding::encode(&show.reddit_query)
        );
        let (reddit_comments, reddit_upvotes) = ureq::get(&reddit_url)
            .set("User-Agent", "TVArenaRust/1.0")
            .call()
            .ok()
            .and_then(|r| r.into_json::<RedditListing>().ok())
            .map(|l| {
                let c: i64 = l.data.children.iter().map(|p| p.data.num_comments).sum();
                let u: i64 = l.data.children.iter().map(|p| p.data.score).sum();
                (c, u)
            })
            .unwrap_or((0, 0));

        let new_score = (wiki_views * 10) + (reddit_comments * 150) + (reddit_upvotes * 25);
        let prev_score = if show.viewers_premiere_28d > 0 { show.viewers_premiere_28d } else { new_score };
        let delta_pct = if prev_score > 0 {
            (((new_score - prev_score) as f64 / prev_score as f64) * 1000.0).round() / 10.0
        } else {
            0.0
        };

        let patch_url = format!("{}/rest/v1/series?id=eq.{}", supabase_url, show_id);
        let _ = ureq::patch(&patch_url)
            .set("apikey", supabase_key)
            .set("Authorization", &format!("Bearer {}", supabase_key))
            .send_json(json!({
                "viewers_premiere_28d": new_score,
                "delta_pct": delta_pct,
                "updated_at": Utc::now().to_rfc3339()
            }));

        let telemetry_url = format!("{}/rest/v1/series_daily_telemetry?on_conflict=series_id,recorded_date", supabase_url);
        let _ = ureq::post(&telemetry_url)
            .set("apikey", supabase_key)
            .set("Authorization", &format!("Bearer {}", supabase_key))
            .set("Prefer", "resolution=merge-duplicates")
            .send_json(json!({
                "series_id": show_id,
                "recorded_date": today_iso,
                "daily_viewers": new_score / 7,
                "wiki_views": wiki_views,
                "reddit_comments": reddit_comments
            }));

        println!("✓ {}: {} viewers ({:+.1}%)", show.title, new_score, delta_pct);
        thread::sleep(Duration::from_millis(600));
    }
    Ok(())
}
