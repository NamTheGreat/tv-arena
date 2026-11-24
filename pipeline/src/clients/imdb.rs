//! Episode-level IMDb rating trajectories through the OMDb API (IMDb has no public API).
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use chrono::NaiveDate;
use serde_json::Value;

use super::backoff::{get_json_with_retry, FetchError, RateLimiter, RetryPolicy};

pub const OMDB_API_BASE: &str = "https://www.omdbapi.com";
pub const OMDB_MIN_INTERVAL: Duration = Duration::from_millis(300);
/// Only the newest seasons are scanned, which bounds the calls spent per show.
const MAX_SEASONS_SCANNED: i64 = 2;

#[derive(Debug, Clone, PartialEq)]
pub struct EpisodeRating {
    pub season: i64,
    pub episode: i64,
    pub rating: f64,
    pub votes: Option<i64>,
}

impl EpisodeRating {
    pub fn label(&self) -> String {
        format!("S{:02}E{:02}", self.season, self.episode)
    }
}

pub struct OmdbClient<'a> {
    agent: &'a ureq::Agent,
    base_url: String,
    api_key: String,
    policy: RetryPolicy,
    limiter: RateLimiter,
    disabled: AtomicBool,
}

impl<'a> OmdbClient<'a> {
    pub fn new(agent: &'a ureq::Agent, api_key: &str) -> Self {
        Self::with_options(
            agent,
            OMDB_API_BASE,
            api_key,
            RetryPolicy::default(),
            OMDB_MIN_INTERVAL,
        )
    }

    pub fn with_options(
        agent: &'a ureq::Agent,
        base_url: &str,
        api_key: &str,
        policy: RetryPolicy,
        min_interval: Duration,
    ) -> Self {
        Self {
            agent,
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key: api_key.to_string(),
            policy,
            limiter: RateLimiter::new(min_interval),
            disabled: AtomicBool::new(false),
        }
    }

    pub fn is_disabled(&self) -> bool {
        self.disabled.load(Ordering::Relaxed)
    }

    fn query(&self, params: &str) -> Result<Value, FetchError> {
        if self.is_disabled() {
            return Err(FetchError::Failed("source disabled for this run".into()));
        }
        let url = format!(
            "{}/?{}&apikey={}",
            self.base_url,
            params,
            urlencoding::encode(&self.api_key)
        );
        let json = get_json_with_retry(self.agent, &url, &[], &self.policy, &self.limiter);
        let result = json.and_then(|v| match classify_error(&v) {
            Some(err) => Err(err),
            None => Ok(v),
        });
        if matches!(
            result,
            Err(FetchError::QuotaExhausted) | Err(FetchError::Unauthorized)
        ) {
            self.disabled.store(true, Ordering::Relaxed);
        }
        result
    }

    /// Rating of the newest episode that had aired by `as_of`. `Ok(None)` means the show or its
    /// episodes have no rating yet, which is normal and not an error.
    pub fn latest_episode_rating(
        &self,
        imdb_id: &str,
        as_of: NaiveDate,
    ) -> Result<Option<EpisodeRating>, FetchError> {
        let id = urlencoding::encode(imdb_id);
        let show = match self.query(&format!("i={}", id)) {
            Ok(v) => v,
            Err(FetchError::Failed(msg)) if is_not_found(&msg) => return Ok(None),
            Err(e) => return Err(e),
        };
        let Some(total) = parse_total_seasons(&show) else {
            return Ok(None);
        };

        let lowest = (total - MAX_SEASONS_SCANNED + 1).max(1);
        for season in (lowest..=total).rev() {
            let season_json = match self.query(&format!("i={}&Season={}", id, season)) {
                Ok(v) => v,
                Err(FetchError::Failed(msg)) if is_not_found(&msg) => continue,
                Err(e) => return Err(e),
            };
            if let Some((episode, rating, episode_id)) =
                pick_latest_rated_episode(&season_json, as_of)
            {
                let votes = episode_id
                    .and_then(|eid| self.query(&format!("i={}", urlencoding::encode(&eid))).ok())
                    .and_then(|v| parse_votes(v.get("imdbVotes")?.as_str()?));
                return Ok(Some(EpisodeRating {
                    season,
                    episode,
                    rating,
                    votes,
                }));
            }
        }
        Ok(None)
    }
}

fn is_not_found(msg: &str) -> bool {
    msg.starts_with("not found")
}

/// OMDb reports failures as HTTP 200 with `Response: "False"`.
pub fn classify_error(json: &Value) -> Option<FetchError> {
    if json.get("Response").and_then(Value::as_str) != Some("False") {
        return None;
    }
    let message = json
        .get("Error")
        .and_then(Value::as_str)
        .unwrap_or("unknown error");
    let lower = message.to_lowercase();
    Some(if lower.contains("limit reached") {
        FetchError::QuotaExhausted
    } else if lower.contains("api key") {
        FetchError::Unauthorized
    } else if lower.contains("not found") || lower.contains("incorrect imdb id") {
        FetchError::Failed(format!("not found: {}", message))
    } else {
        FetchError::Failed(message.to_string())
    })
}

pub fn parse_total_seasons(json: &Value) -> Option<i64> {
    json.get("totalSeasons")?
        .as_str()?
        .trim()
        .parse::<i64>()
        .ok()
        .filter(|n| *n > 0)
}

pub fn parse_votes(raw: &str) -> Option<i64> {
    raw.replace(',', "")
        .trim()
        .parse::<i64>()
        .ok()
        .filter(|n| *n >= 0)
}

/// Newest aired episode with a numeric rating: (episode number, rating, IMDb episode id).
pub fn pick_latest_rated_episode(
    season: &Value,
    as_of: NaiveDate,
) -> Option<(i64, f64, Option<String>)> {
    let episodes = season.get("Episodes")?.as_array()?;
    episodes
        .iter()
        .filter_map(|ep| {
            let released =
                NaiveDate::parse_from_str(ep.get("Released")?.as_str()?, "%Y-%m-%d").ok()?;
            if released > as_of {
                return None;
            }
            let rating: f64 = ep.get("imdbRating")?.as_str()?.parse().ok()?;
            if !(1.0..=10.0).contains(&rating) {
                return None;
            }
            let number: i64 = ep.get("Episode")?.as_str()?.parse().ok()?;
            let id = ep.get("imdbID").and_then(Value::as_str).map(str::to_string);
            Some((released, number, rating, id))
        })
        .max_by_key(|(released, number, _, _)| (*released, *number))
        .map(|(_, number, rating, id)| (number, rating, id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn day(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn picks_newest_aired_rated_episode() {
        let season = json!({"Episodes":[
            {"Episode":"1","Released":"2026-11-06","imdbRating":"8.1","imdbID":"tt1"},
            {"Episode":"2","Released":"2026-11-13","imdbRating":"8.7","imdbID":"tt2"},
            {"Episode":"3","Released":"2026-11-20","imdbRating":"N/A","imdbID":"tt3"},
            {"Episode":"4","Released":"2026-11-27","imdbRating":"9.9","imdbID":"tt4"}
        ]});
        // Episode 3 is unrated and episode 4 has not aired yet.
        let (episode, rating, id) = pick_latest_rated_episode(&season, day("2026-11-23")).unwrap();
        assert_eq!((episode, rating, id.as_deref()), (2, 8.7, Some("tt2")));
        assert!(pick_latest_rated_episode(&season, day("2026-11-01")).is_none());
        assert!(pick_latest_rated_episode(
            &json!({"Episodes":[{"Episode":"1","Released":"N/A","imdbRating":"7.0"}]}),
            day("2026-11-23")
        )
        .is_none());
        assert!(pick_latest_rated_episode(
            &json!({"Episodes":[{"Episode":"1","Released":"2026-11-01","imdbRating":"11.2"}]}),
            day("2026-11-23")
        )
        .is_none());
    }

    #[test]
    fn parses_seasons_and_votes() {
        assert_eq!(parse_total_seasons(&json!({"totalSeasons":"4"})), Some(4));
        assert_eq!(parse_total_seasons(&json!({"totalSeasons":"N/A"})), None);
        assert_eq!(parse_votes("12,345"), Some(12345));
        assert_eq!(parse_votes("N/A"), None);
    }

    #[test]
    fn classifies_omdb_errors() {
        assert_eq!(classify_error(&json!({"Response":"True"})), None);
        assert_eq!(
            classify_error(&json!({"Response":"False","Error":"Request limit reached!"})),
            Some(FetchError::QuotaExhausted)
        );
        assert_eq!(
            classify_error(&json!({"Response":"False","Error":"Invalid API key!"})),
            Some(FetchError::Unauthorized)
        );
        assert!(matches!(
            classify_error(&json!({"Response":"False","Error":"Series or episode not found!"})),
            Some(FetchError::Failed(m)) if m.starts_with("not found")
        ));
    }

    #[test]
    fn labels_episodes() {
        let r = EpisodeRating {
            season: 2,
            episode: 5,
            rating: 8.0,
            votes: None,
        };
        assert_eq!(r.label(), "S02E05");
    }
}
