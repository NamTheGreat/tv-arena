use anyhow::{anyhow, bail, Result};
use serde::{Deserialize, Serialize};
use std::fmt;
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

/// The TMDb ID does not exist (404/410). This is a catalog data problem, not a transient failure,
/// so it is never retried and callers can tell it apart from outages.
#[derive(Debug, PartialEq, Eq)]
pub struct TmdbNotFound {
    pub status: u16,
}

impl fmt::Display for TmdbNotFound {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "TMDb has no such show (HTTP {})", self.status)
    }
}

impl std::error::Error for TmdbNotFound {}

pub fn is_not_found(err: &anyhow::Error) -> bool {
    err.downcast_ref::<TmdbNotFound>().is_some()
}

const TMDB_BASE_URL: &str = "https://api.themoviedb.org/3";

/// Fetch season premiere and finale events for a given series from TMDb.
/// Handles rate limits (429) with exponential backoff and skips invalid dates.
pub fn fetch_show_events(
    client: &ureq::Agent,
    api_key: &str,
    tmdb_id: i64,
) -> Result<Vec<SeriesEventItem>> {
    fetch_show_events_from(client, TMDB_BASE_URL, api_key, tmdb_id)
}

fn fetch_show_events_from(
    client: &ureq::Agent,
    base_url: &str,
    api_key: &str,
    tmdb_id: i64,
) -> Result<Vec<SeriesEventItem>> {
    let url = format!("{}/tv/{}", base_url, tmdb_id);

    let show_res = make_tmdb_request(client, &url, api_key)?;
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
            "{}/tv/{}/season/{}",
            base_url, tmdb_id, season.season_number
        );

        let season_res = match make_tmdb_request(client, &season_url, api_key) {
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

fn make_tmdb_request(client: &ureq::Agent, url: &str, api_key: &str) -> Result<ureq::Response> {
    let is_bearer = api_key.len() > 32 || api_key.starts_with("ey");
    let mut backoff = Duration::from_millis(500);
    for attempt in 0..3 {
        let mut req = client.get(url).set("Accept", "application/json");
        if is_bearer {
            req = req.set("Authorization", &format!("Bearer {}", api_key));
        } else {
            req = req.query("api_key", api_key);
        }

        // Error text never includes the request URL, which carries the API key for key-based auth.
        match req.call() {
            Ok(resp) => return Ok(resp),
            Err(ureq::Error::Status(code @ (404 | 410), _)) => {
                return Err(anyhow::Error::new(TmdbNotFound { status: code }))
            }
            Err(ureq::Error::Status(code @ (401 | 403), _)) => {
                bail!("TMDb rejected the credentials (HTTP {})", code)
            }
            Err(ureq::Error::Status(code, _)) if code == 429 || code >= 500 => {
                if attempt == 2 {
                    bail!("TMDb request failed after 3 attempts (HTTP {})", code);
                }
                thread::sleep(backoff);
                backoff *= 2;
            }
            Err(ureq::Error::Status(code, _)) => bail!("TMDb request failed (HTTP {})", code),
            Err(ureq::Error::Transport(t)) => {
                if attempt == 2 {
                    return Err(anyhow!(
                        "TMDb request failed after 3 attempts: {}",
                        t.kind()
                    ));
                }
                thread::sleep(backoff);
                backoff *= 2;
            }
        }
    }
    bail!("TMDb request exhausted retries")
}

#[cfg(test)]
mod tests {
    use super::*;
    use httpmock::prelude::*;

    fn agent() -> ureq::Agent {
        ureq::builder().timeout_read(Duration::from_secs(5)).build()
    }

    #[test]
    fn missing_show_is_typed_not_found_and_not_retried() {
        let server = MockServer::start();
        let m = server.mock(|when, then| {
            when.method(GET).path("/tv/57405");
            then.status(404).body("{\"success\":false}");
        });
        let err = fetch_show_events_from(&agent(), &server.base_url(), "key", 57405).unwrap_err();
        assert!(is_not_found(&err));
        assert_eq!(m.hits(), 1, "404 must not be retried");
        assert!(
            !err.to_string().contains("api_key"),
            "message must not leak the key URL"
        );
    }

    #[test]
    fn invalid_credentials_fail_fast_without_not_found() {
        let server = MockServer::start();
        let m = server.mock(|when, then| {
            when.method(GET).path("/tv/1");
            then.status(401);
        });
        let err =
            fetch_show_events_from(&agent(), &server.base_url(), "secret-key", 1).unwrap_err();
        assert!(!is_not_found(&err));
        assert_eq!(m.hits(), 1);
        assert!(!err.to_string().contains("secret-key"));
    }

    #[test]
    fn server_errors_are_retried_then_reported_without_key() {
        let server = MockServer::start();
        let m = server.mock(|when, then| {
            when.method(GET).path("/tv/2");
            then.status(500);
        });
        let err =
            fetch_show_events_from(&agent(), &server.base_url(), "secret-key", 2).unwrap_err();
        assert!(!is_not_found(&err));
        assert_eq!(m.hits(), 3);
        assert!(err.to_string().contains("HTTP 500"));
        assert!(!err.to_string().contains("secret-key"));
    }

    #[test]
    fn existing_show_yields_events() {
        let server = MockServer::start();
        server.mock(|when, then| {
            when.method(GET).path("/tv/3");
            then.status(200).json_body(serde_json::json!({
                "status": "Returning Series",
                "seasons": [{"season_number": 1, "episode_count": 2}]
            }));
        });
        server.mock(|when, then| {
            when.method(GET).path("/tv/3/season/1");
            then.status(200).json_body(serde_json::json!({
                "episodes": [{"air_date": "2024-01-01"}, {"air_date": "2024-03-01"}]
            }));
        });
        let events = fetch_show_events_from(&agent(), &server.base_url(), "key", 3).unwrap();
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].kind, "premiere");
    }
}
