use anyhow::{bail, Context, Result};
use chrono::Utc;
use serde_json::json;

use crate::config::Config;
use crate::models::{SeedSeriesPayload, SeriesRow};

pub fn fetch_series(client: &ureq::Agent, config: &Config) -> Result<Vec<SeriesRow>> {
    let list_url = format!(
        "{}/rest/v1/series?select=*&order=buzz_score.desc",
        config.supabase_url
    );
    let list_res = client
        .get(&list_url)
        .set("apikey", &config.supabase_key)
        .set("Authorization", &format!("Bearer {}", config.supabase_key))
        .call();

    match list_res {
        Ok(res) => res
            .into_json()
            .context("Failed to parse series response from Supabase as JSON"),
        Err(ureq::Error::Status(404, res)) => {
            let body = res.into_string().unwrap_or_default();
            eprintln!(
                "Error: Table 'series' was not found in Supabase (HTTP 404).\n\
                 Please execute 'supabase/schema.sql' in your Supabase SQL Editor to initialize the database tables.\n\
                 Server response: {}",
                body
            );
            std::process::exit(1);
        }
        Err(e) => Err(e.into()),
    }
}

pub fn upsert_seed_series(
    client: &ureq::Agent,
    config: &Config,
    payload: &SeedSeriesPayload,
) -> Result<bool> {
    let endpoint = format!("{}/rest/v1/series?on_conflict=tmdb_id", config.supabase_url);
    let res = client
        .post(&endpoint)
        .set("apikey", &config.supabase_key)
        .set("Authorization", &format!("Bearer {}", config.supabase_key))
        .set("Prefer", "resolution=merge-duplicates")
        .send_json(ureq::serde_json::to_value(payload)?);

    match res {
        Ok(response) => Ok(response.status() >= 200 && response.status() < 300),
        Err(e) => {
            eprintln!("❌ Failed upserting seed series '{}': {}", payload.title, e);
            Ok(false)
        }
    }
}

pub fn fetch_prev_reddit_comments(
    client: &ureq::Agent,
    config: &Config,
    show_id: &str,
) -> Option<i64> {
    let prev_telemetry_url = format!(
        "{}/rest/v1/series_daily_telemetry?series_id=eq.{}&order=recorded_date.desc&limit=1",
        config.supabase_url, show_id
    );
    client
        .get(&prev_telemetry_url)
        .set("apikey", &config.supabase_key)
        .set("Authorization", &format!("Bearer {}", config.supabase_key))
        .call()
        .ok()
        .and_then(|r| r.into_json::<Vec<serde_json::Value>>().ok())
        .and_then(|rows| rows.into_iter().next())
        .and_then(|row| row.get("reddit_comments").and_then(|v| v.as_i64()))
}

pub fn fetch_prior_day_score(
    client: &ureq::Agent,
    config: &Config,
    show_id: &str,
    recorded_date: &str,
) -> Option<i64> {
    let prior_telemetry_url = format!(
        "{}/rest/v1/series_daily_telemetry?series_id=eq.{}&recorded_date=lt.{}&order=recorded_date.desc&limit=1",
        config.supabase_url, show_id, recorded_date
    );
    client
        .get(&prior_telemetry_url)
        .set("apikey", &config.supabase_key)
        .set("Authorization", &format!("Bearer {}", config.supabase_key))
        .call()
        .ok()
        .and_then(|r| r.into_json::<Vec<serde_json::Value>>().ok())
        .and_then(|rows| rows.into_iter().next())
        .and_then(|row| row.get("daily_score").and_then(|v| v.as_i64()))
        .map(|dv| dv * 7)
}

pub fn patch_series_score(
    client: &ureq::Agent,
    config: &Config,
    show_id: &str,
    new_score: i64,
    delta_pct: f64,
) -> Result<()> {
    let patch_url = format!("{}/rest/v1/series?id=eq.{}", config.supabase_url, show_id);
    client
        .patch(&patch_url)
        .set("apikey", &config.supabase_key)
        .set("Authorization", &format!("Bearer {}", config.supabase_key))
        .send_json(json!({
            "buzz_score": new_score,
            "delta_pct": delta_pct,
            "updated_at": Utc::now().to_rfc3339()
        }))?;
    Ok(())
}

pub fn batch_record_daily_telemetry(
    client: &ureq::Agent,
    config: &Config,
    telemetry_batch: Vec<serde_json::Value>,
) -> Result<()> {
    let telemetry_url = format!(
        "{}/rest/v1/series_daily_telemetry?on_conflict=series_id,recorded_date",
        config.supabase_url
    );
    client
        .post(&telemetry_url)
        .set("apikey", &config.supabase_key)
        .set("Authorization", &format!("Bearer {}", config.supabase_key))
        .set("Prefer", "resolution=merge-duplicates")
        .send_json(serde_json::Value::Array(telemetry_batch))?;
    Ok(())
}

pub fn insert_daily_challenge(
    client: &ureq::Agent,
    config: &Config,
    date: &str,
    series_ids: &[String],
) -> Result<()> {
    let endpoint = format!(
        "{}/rest/v1/daily_challenges?on_conflict=date",
        config.supabase_url
    );
    let payload = json!({
        "date": date,
        "series_ids": series_ids
    });

    let res = client
        .post(&endpoint)
        .set("apikey", &config.supabase_key)
        .set("Authorization", &format!("Bearer {}", config.supabase_key))
        .set("Prefer", "resolution=ignore-duplicates")
        .send_json(payload);

    match res {
        Ok(_) => Ok(()),
        Err(ureq::Error::Status(code, res)) => {
            let body = res.into_string().unwrap_or_default();
            bail!("Supabase daily_challenges insert error {}: {}", code, body)
        }
        Err(e) => Err(e.into()),
    }
}

pub fn create_sync_run(client: &ureq::Agent, config: &Config, total_shows: usize) -> Option<i64> {
    let endpoint = format!("{}/rest/v1/sync_runs", config.supabase_url);
    let payload = json!({
        "status": "running",
        "shows_total": total_shows,
        "started_at": Utc::now().to_rfc3339()
    });

    let res = client
        .post(&endpoint)
        .set("apikey", &config.supabase_key)
        .set("Authorization", &format!("Bearer {}", config.supabase_key))
        .set("Prefer", "return=representation")
        .send_json(payload);

    match res {
        Ok(r) => {
            let rows: Vec<serde_json::Value> = r.into_json().unwrap_or_default();
            rows.first()
                .and_then(|row| row.get("id").and_then(|id| id.as_i64()))
        }
        Err(e) => {
            eprintln!("⚠️  Could not record sync_runs start: {}", e);
            None
        }
    }
}

#[derive(Debug, Default)]
pub struct SyncRunUpdate<'a> {
    pub status: &'a str,
    pub shows_updated: usize,
    pub shows_failed: usize,
    pub wiki_failures: usize,
    pub reddit_failures: usize,
    pub error_log: Option<&'a str>,
    pub duration_ms: i64,
}

pub fn update_sync_run(client: &ureq::Agent, config: &Config, run_id: i64, update: &SyncRunUpdate) {
    let endpoint = format!("{}/rest/v1/sync_runs?id=eq.{}", config.supabase_url, run_id);
    let payload = json!({
        "status": update.status,
        "completed_at": Utc::now().to_rfc3339(),
        "shows_updated": update.shows_updated,
        "shows_failed": update.shows_failed,
        "wiki_failures": update.wiki_failures,
        "reddit_failures": update.reddit_failures,
        "error_log": update.error_log,
        "duration_ms": update.duration_ms
    });

    let res = client
        .patch(&endpoint)
        .set("apikey", &config.supabase_key)
        .set("Authorization", &format!("Bearer {}", config.supabase_key))
        .send_json(payload);

    if let Err(e) = res {
        eprintln!("⚠️  Could not update sync_runs completion: {}", e);
    }
}
