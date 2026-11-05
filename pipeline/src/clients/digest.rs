use anyhow::{Context, Result};
use serde::Deserialize;

use crate::config::Config;

#[derive(Debug, Deserialize)]
pub struct Mover {
    pub title: String,
    pub current_7d_score: i64,
    pub previous_7d_score: i64,
}

#[derive(Debug, Deserialize)]
pub struct Breakout {
    pub signal: String,
    pub value: f64,
    pub reason: String,
    pub series: Option<BreakoutSeries>,
}

#[derive(Debug, Deserialize)]
pub struct BreakoutSeries {
    pub title: String,
}

pub fn fetch_movers(client: &ureq::Agent, config: &Config) -> Result<Vec<Mover>> {
    let url = format!(
        "{}/rest/v1/series_leaderboard?select=title,current_7d_score,previous_7d_score&limit=1000",
        config.supabase_url
    );
    client
        .get(&url)
        .set("apikey", &config.supabase_key)
        .set("Authorization", &format!("Bearer {}", config.supabase_key))
        .call()?
        .into_json()
        .context("Failed to parse leaderboard rows for digest")
}

pub fn fetch_breakouts(client: &ureq::Agent, config: &Config, date: &str) -> Result<Vec<Breakout>> {
    let url = format!(
        "{}/rest/v1/series_breakouts?select=signal,value,reason,series(title)&detected_date=eq.{}&order=value.desc&limit=3",
        config.supabase_url, date
    );
    client
        .get(&url)
        .set("apikey", &config.supabase_key)
        .set("Authorization", &format!("Bearer {}", config.supabase_key))
        .call()?
        .into_json()
        .context("Failed to parse breakout rows for digest")
}
