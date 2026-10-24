use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct KaggleRow {
    pub id: i32,
    pub name: String,
    pub vote_count: f64,
    pub vote_average: f64,
    pub popularity: f64,
    pub networks: String,
    pub genres: String,
    pub first_air_date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeriesRow {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub tmdb_id: i32,
    pub slug: String,
    pub title: String,
    pub network: String,
    pub genre_group: String,
    pub release_years: String,
    pub chart_color: String,
    pub wiki_slug: String,
    pub reddit_query: String,
    #[serde(default)]
    pub buzz_score: i64,
    #[serde(default)]
    pub delta_pct: f64,
}

#[derive(Debug, Serialize)]
pub struct SeedSeriesPayload {
    pub tmdb_id: i32,
    pub slug: String,
    pub title: String,
    pub network: String,
    pub genre_group: String,
    pub release_years: String,
    pub chart_color: String,
    pub wiki_slug: String,
    pub reddit_query: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct WikiPageviews {
    pub items: Option<Vec<WikiDay>>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct WikiDay {
    pub timestamp: String,
    pub views: i64,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct RedditListing {
    pub data: RedditData,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct RedditData {
    pub children: Vec<RedditChild>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct RedditChild {
    pub data: RedditPost,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct RedditPost {
    pub num_comments: i64,
    pub score: i64,
}
