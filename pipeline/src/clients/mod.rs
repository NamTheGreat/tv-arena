pub mod http;
pub mod reddit;
pub mod supabase;
pub mod wikipedia;

pub use http::create_http_client;

use crate::models::WikiDay;

pub trait TelemetryFetcher {
    fn fetch_wiki_days(
        &self,
        wiki_slug: &str,
        start_str: &str,
        end_str: &str,
        title: &str,
    ) -> Option<Vec<WikiDay>>;

    fn fetch_reddit_stats(&self, reddit_query: &str, title: &str) -> Option<(i64, i64)>;
}

pub struct HttpTelemetryFetcher<'a> {
    pub client: &'a ureq::Agent,
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
}
