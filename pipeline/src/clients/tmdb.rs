use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use std::{thread, time::Duration};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SeriesEventItem {
    pub event_date: String,
    pub kind: String,
    pub label: String,
    pub source: String,
}

#[derive(Deserialize)]
struct TmdbShowDetails {
    status: Option<String>,
    seasons: Option<Vec<TmdbSeasonSummary>>,
}

#[derive(Deserialize)]
struct TmdbSeasonSummary {
    season_number: i64,
    episode_count: Option<i64>,
}

#[derive(Deserialize)]
struct TmdbSeasonDetails {
    episodes: Option<Vec<TmdbEpisodeSummary>>,
}

#[derive(Deserialize)]
struct TmdbEpisodeSummary {
    air_date: Option<String>,
}

/// Fetch season premiere and finale events for a given series from TMDb.
/// Handles rate limits (429) with exponential backoff and skips invalid dates.
pub fn fetch_show_events(
    client: &ureq::Agent,
    api_key: &str,
    tmdb_id: i64,
) -> Result<Vec<SeriesEventItem>> {
    let url = format!("https://api.themoviedb.org/3/tv/{}", tmdb_id);
    let auth_header = format!("Bearer {}", api_key);

    let show_res = make_tmdb_request(client, &url, &auth_header, api_key)?;
    let show_details: TmdbShowDetails = match show_res.into_json() {
        Ok(d) => d,
        Err(e) => bail!("Failed parsing TMDb show {}: {}", tmdb_id, e),
    };

    let is_ended = show_details
        .status
        .as_deref()
        .map(|s| s.eq_ignore_ascii_case("ended") || s.eq_ignore_ascii_case("canceled"))
        .unwrap_or(false);

    let seasons = show_details.seasons.unwrap_or_default();
    let valid_seasons: Vec<&TmdbSeasonSummary> = seasons
        .iter()
        .filter(|s| s.season_number > 0 && s.episode_count.unwrap_or(0) > 0)
        .collect();

    let max_season = valid_seasons
        .iter()
        .map(|s| s.season_number)
        .max()
        .unwrap_or(1);

    let mut events = Vec::new();

    for season in valid_seasons {
        thread::sleep(Duration::from_millis(250)); // Respect TMDb 40 req/10s limit
        let season_url = format!(
            "https://api.themoviedb.org/3/tv/{}/season/{}",
            tmdb_id, season.season_number
        );

        let season_res = match make_tmdb_request(client, &season_url, &auth_header, api_key) {
            Ok(r) => r,
            Err(e) => {
                eprintln!(
                    "⚠️  Could not fetch season {} for TMDb ID {}: {}",
                    season.season_number, tmdb_id, e
                );
                continue;
            }
        };

        let season_details: TmdbSeasonDetails = match season_res.into_json() {
            Ok(d) => d,
            Err(_) => continue,
        };

        let episodes = season_details.episodes.unwrap_or_default();
        let episodes_with_dates: Vec<&TmdbEpisodeSummary> = episodes
            .iter()
            .filter(|ep| ep.air_date.as_ref().is_some_and(|d| !d.trim().is_empty()))
            .collect();

        if episodes_with_dates.is_empty() {
            continue;
        }

        // Season Premiere (first episode with air date)
        if let Some(first_ep) = episodes_with_dates.first() {
            if let Some(ref date) = first_ep.air_date {
                let kind = if season.season_number == 1 {
                    "premiere"
                } else {
                    "season_premiere"
                };
                let label = if season.season_number == 1 {
                    "Series Premiere".to_string()
                } else {
                    format!("S{} Premiere", season.season_number)
                };

                events.push(SeriesEventItem {
                    event_date: date.clone(),
                    kind: kind.to_string(),
                    label,
                    source: "tmdb".to_string(),
                });
            }
        }

        // Season Finale (last episode with air date)
        if episodes_with_dates.len() > 1 {
            if let Some(last_ep) = episodes_with_dates.last() {
                if let Some(ref date) = last_ep.air_date {
                    let is_series_finale = is_ended && season.season_number == max_season;
                    let kind = if is_series_finale {
                        "finale"
                    } else {
                        "season_finale"
                    };
                    let label = if is_series_finale {
                        "Series Finale".to_string()
                    } else {
                        format!("S{} Finale", season.season_number)
                    };

                    // Only push if not exact duplicate of premiere date
                    if !events
                        .iter()
                        .any(|e| e.event_date == *date && e.kind == kind)
                    {
                        events.push(SeriesEventItem {
                            event_date: date.clone(),
                            kind: kind.to_string(),
                            label,
                            source: "tmdb".to_string(),
                        });
                    }
                }
            }
        }
    }

    Ok(events)
}

fn make_tmdb_request(
    client: &ureq::Agent,
    url: &str,
    auth_header: &str,
    api_key: &str,
) -> Result<ureq::Response> {
    let mut backoff = Duration::from_millis(500);
    for attempt in 0..3 {
        let req = client
            .get(url)
            .query("api_key", api_key)
            .set("Authorization", auth_header)
            .set("Accept", "application/json");

        match req.call() {
            Ok(resp) => return Ok(resp),
            Err(ureq::Error::Status(429, _)) => {
                thread::sleep(backoff);
                backoff *= 2;
            }
            Err(e) if attempt == 2 => bail!("TMDb request failed after 3 attempts: {}", e),
            Err(_) => {
                thread::sleep(backoff);
                backoff *= 2;
            }
        }
    }
    bail!("TMDb request exhausted retries")
}
