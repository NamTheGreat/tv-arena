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
    pub viewers_premiere_28d: i64,
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

#[derive(Deserialize)]
pub struct WikiPageviews {
    pub items: Option<Vec<WikiDay>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WikiDay {
    pub timestamp: String,
    pub views: i64,
}

#[derive(Deserialize)]
pub struct RedditListing {
    pub data: RedditData,
}

#[derive(Deserialize)]
pub struct RedditData {
    pub children: Vec<RedditChild>,
}

#[derive(Deserialize)]
pub struct RedditChild {
    pub data: RedditPost,
}

#[derive(Deserialize)]
pub struct RedditPost {
    pub num_comments: i64,
    pub score: i64,
}

#[derive(Debug, Deserialize)]
pub struct TmdbTrendingResponse {
    pub page: Option<i32>,
    #[serde(default)]
    pub results: Vec<TmdbTvShow>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TmdbTvShow {
    pub id: i32,
    pub name: String,
    pub original_name: Option<String>,
    pub overview: Option<String>,
    pub first_air_date: Option<String>,
    #[serde(default)]
    pub popularity: f64,
    #[serde(default)]
    pub vote_average: f64,
    #[serde(default)]
    pub vote_count: f64,
    #[serde(default)]
    pub genre_ids: Vec<i32>,
}

#[derive(Debug, Deserialize)]
pub struct TmdbTvDetail {
    pub id: i32,
    pub name: String,
    pub first_air_date: Option<String>,
    #[serde(default)]
    pub networks: Vec<TmdbNetwork>,
    #[serde(default)]
    pub genres: Vec<TmdbGenre>,
}

#[derive(Debug, Deserialize)]
pub struct TmdbNetwork {
    pub id: i32,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct TmdbGenre {
    pub id: i32,
    pub name: String,
}
