pub mod backoff;
pub mod digest;
pub mod http;
pub mod imdb;
pub mod reddit;
pub mod social;
pub mod supabase;
pub mod tmdb;
pub mod wikipedia;

pub use http::create_http_client;

use crate::config::Config;
use crate::models::WikiDay;

pub use imdb::EpisodeRating;

pub trait TelemetryFetcher {
    fn fetch_wiki_days(
        &self,
        wiki_slug: &str,
        start_str: &str,
        end_str: &str,
        title: &str,
    ) -> Option<Vec<WikiDay>>;

    fn fetch_reddit_stats(&self, reddit_query: &str, title: &str) -> Option<(i64, i64)>;

    // Optional secondary signals. They are best-effort: sources that are not configured,
    // rate limited or failing return None and never affect the core sync outcome.

    /// Mention volume for the show on `date` (YYYY-MM-DD).
    fn fetch_social_mentions(&self, _title: &str, _date: &str) -> Option<i64> {
        None
    }

    /// Rating of the newest aired episode as of `date`.
    fn fetch_imdb_rating(&self, _imdb_id: &str, _date: &str) -> Option<EpisodeRating> {
        None
    }

    fn imdb_enabled(&self) -> bool {
        false
    }

    /// Resolve a show's IMDb id from its TMDb id.
    fn resolve_imdb_id(&self, _tmdb_id: i32) -> Option<String> {
        None
    }
}

pub struct HttpTelemetryFetcher<'a> {
    pub client: &'a ureq::Agent,
    pub social: Option<social::XMentionsClient<'a>>,
    pub imdb: Option<imdb::OmdbClient<'a>>,
    pub tmdb_api_key: Option<String>,
}

impl<'a> HttpTelemetryFetcher<'a> {
    pub fn new(client: &'a ureq::Agent, config: &Config) -> Self {
        Self {
            client,
            social: config
                .x_bearer_token
                .as_deref()
                .map(|token| social::XMentionsClient::new(client, token)),
            imdb: config
                .omdb_api_key
                .as_deref()
                .map(|key| imdb::OmdbClient::new(client, key)),
            tmdb_api_key: config.tmdb_api_key.clone(),
        }
    }
}

impl<'a> TelemetryFetcher for HttpTelemetryFetcher<'a> {
    fn fetch_wiki_days(
        &self,
        wiki_slug: &str,
        start_str: &str,
        end_str: &str,
        title: &str,
    ) -> Option<Vec<WikiDay>> {
        crate::clients::wikipedia::fetch_wiki_days(
            self.client,
            wiki_slug,
            start_str,
            end_str,
            title,
        )
    }

    fn fetch_reddit_stats(&self, reddit_query: &str, title: &str) -> Option<(i64, i64)> {
        crate::clients::reddit::fetch_reddit_stats(self.client, reddit_query, title)
    }

    fn fetch_social_mentions(&self, title: &str, date: &str) -> Option<i64> {
        let client = self.social.as_ref()?;
        if client.is_disabled() {
            return None;
        }
        let date = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()?;
        match client.daily_mentions(title, date) {
            Ok(count) => Some(count),
            Err(e) => {
                eprintln!("⚠️  X mentions unavailable for '{}': {}", title, e);
                None
            }
        }
    }

    fn fetch_imdb_rating(&self, imdb_id: &str, date: &str) -> Option<EpisodeRating> {
        let client = self.imdb.as_ref()?;
        if client.is_disabled() {
            return None;
        }
        let date = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()?;
        match client.latest_episode_rating(imdb_id, date) {
            Ok(rating) => rating,
            Err(e) => {
                eprintln!("⚠️  IMDb rating unavailable for {}: {}", imdb_id, e);
                None
            }
        }
    }

    fn imdb_enabled(&self) -> bool {
        self.imdb
            .as_ref()
            .map(|c| !c.is_disabled())
            .unwrap_or(false)
    }

    fn resolve_imdb_id(&self, tmdb_id: i32) -> Option<String> {
        let key = self.tmdb_api_key.as_deref()?;
        crate::clients::tmdb::fetch_imdb_id(self.client, key, tmdb_id as i64)
            .ok()
            .flatten()
    }
}
