use anyhow::{Context, Result};

use crate::models::{TmdbTrendingResponse, TmdbTvDetail};

pub fn fetch_trending_tv(
    client: &ureq::Agent,
    api_key_or_token: &str,
    page: i32,
) -> Result<TmdbTrendingResponse> {
    let is_bearer = api_key_or_token.starts_with("ey") || api_key_or_token.starts_with("Bearer ");
    let url = if is_bearer {
        format!(
            "https://api.themoviedb.org/3/trending/tv/week?page={}",
            page
        )
    } else {
        format!(
            "https://api.themoviedb.org/3/trending/tv/week?api_key={}&page={}",
            api_key_or_token, page
        )
    };

    let mut req = client
        .get(&url)
        .set("User-Agent", "TVArenaRust/1.0 (https://tv-arena.pages.dev)");

    if is_bearer {
        let token = api_key_or_token.trim_start_matches("Bearer ").trim();
        req = req.set("Authorization", &format!("Bearer {}", token));
    }

    let res = req
        .call()
        .context("Failed executing TMDB trending TV API request")?;

    let trending: TmdbTrendingResponse = res
        .into_json()
        .context("Failed parsing TMDB trending TV response as JSON")?;

    Ok(trending)
}

pub fn fetch_tv_detail(
    client: &ureq::Agent,
    api_key_or_token: &str,
    tmdb_id: i32,
) -> Result<TmdbTvDetail> {
    let is_bearer = api_key_or_token.starts_with("ey") || api_key_or_token.starts_with("Bearer ");
    let url = if is_bearer {
        format!("https://api.themoviedb.org/3/tv/{}", tmdb_id)
    } else {
        format!(
            "https://api.themoviedb.org/3/tv/{}?api_key={}",
            tmdb_id, api_key_or_token
        )
    };

    let mut req = client
        .get(&url)
        .set("User-Agent", "TVArenaRust/1.0 (https://tv-arena.pages.dev)");

    if is_bearer {
        let token = api_key_or_token.trim_start_matches("Bearer ").trim();
        req = req.set("Authorization", &format!("Bearer {}", token));
    }

    let res = req
        .call()
        .context("Failed executing TMDB TV detail API request")?;

    let detail: TmdbTvDetail = res
        .into_json()
        .context("Failed parsing TMDB TV detail response as JSON")?;

    Ok(detail)
}
