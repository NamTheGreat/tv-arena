use crate::engine::is_tv_description;
use crate::models::{WikiDay, WikiPageviews};
use std::collections::HashSet;

pub fn resolve_wiki_slug(
    title: &str,
    first_air_date: Option<&str>,
    client: &ureq::Agent,
) -> Option<String> {
    resolve_wiki_slug_from_base(title, first_air_date, client, "https://en.wikipedia.org")
}

fn resolve_wiki_slug_from_base(
    title: &str,
    first_air_date: Option<&str>,
    client: &ureq::Agent,
    base_url: &str,
) -> Option<String> {
    let base = title.replace(' ', "_");
    let year = first_air_date.and_then(|date| date.get(0..4));
    let mut candidates = Vec::new();
    if let Some(year) = year.filter(|year| year.chars().all(|c| c.is_ascii_digit())) {
        candidates.push(format!("{}_({}_TV_series)", base, year));
    }
    for suffix in [
        "TV_series",
        "American_TV_series",
        "British_TV_series",
        "Australian_TV_series",
        "Canadian_TV_series",
        "South_Korean_TV_series",
        "Japanese_TV_series",
        "Indian_TV_series",
        "Spanish_TV_series",
        "French_TV_series",
    ] {
        candidates.push(format!("{}_({})", base, suffix));
    }
    candidates.push(base);

    let mut tried = HashSet::new();
    for slug in candidates {
        if let Some(found) = fetch_tv_summary(&slug, client, base_url) {
            return Some(found);
        }
        tried.insert(slug);
    }

    let search = format!("{} television series", title);
    let search_url = format!(
        "{}/w/api.php?action=query&list=search&srsearch={}&format=json&srlimit=10",
        base_url,
        urlencoding::encode(&search)
    );
    let response = client
        .get(&search_url)
        .set("User-Agent", "TVArenaRust/1.0")
        .call()
        .ok()?;
    let results: serde_json::Value = response.into_json().ok()?;
    for candidate in results
        .pointer("/query/search")
        .and_then(|items| items.as_array())?
        .iter()
        .filter_map(|item| item.get("title").and_then(|v| v.as_str()))
        .map(|candidate| candidate.replace(' ', "_"))
    {
        if tried.insert(candidate.clone()) {
            if let Some(found) = fetch_tv_summary(&candidate, client, base_url) {
                return Some(found);
            }
        }
    }
    None
}

fn fetch_tv_summary(slug: &str, client: &ureq::Agent, base_url: &str) -> Option<String> {
    let url = format!(
        "{}/api/rest_v1/page/summary/{}",
        base_url,
        urlencoding::encode(slug)
    );
    let response = client
        .get(&url)
        .set("User-Agent", "TVArenaRust/1.0")
        .call()
        .ok()?;
    let body: serde_json::Value = response.into_json().ok()?;
    if body.get("type").and_then(|value| value.as_str()) != Some("standard") {
        return None;
    }
    let description = body
        .get("description")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let extract = body
        .get("extract")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    if !is_tv_description(description, extract, slug) {
        return None;
    }
    body.pointer("/titles/canonical")
        .and_then(|value| value.as_str())
        .map(str::to_string)
        .or_else(|| Some(slug.to_string()))
}

pub fn parse_wiki_pageviews(json_str: &str) -> Option<Vec<WikiDay>> {
    serde_json::from_str::<WikiPageviews>(json_str)
        .ok()
        .and_then(|w| w.items)
}

pub fn fetch_wiki_days(
    client: &ureq::Agent,
    wiki_slug: &str,
    start_str: &str,
    end_str: &str,
    title: &str,
) -> Option<Vec<WikiDay>> {
    let wiki_url = format!(
        "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/{}/daily/{}/{}",
        urlencoding::encode(wiki_slug),
        start_str,
        end_str
    );

    let wiki_result = client
        .get(&wiki_url)
        .set(
            "User-Agent",
            "linux:tv-arena-pipeline:v0.1.0 (https://github.com/NamTheGreat/tv-arena)",
        )
        .call();

    match wiki_result {
        Ok(r) if r.status() == 200 => {
            let body = r.into_string().ok()?;
            parse_wiki_pageviews(&body)
        }
        Ok(r) => {
            eprintln!("⚠️  Wiki returned status {} for '{}'", r.status(), title);
            None
        }
        Err(e) => {
            eprintln!("⚠️  Wiki fetch error for '{}': {}", title, e);
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use httpmock::{Method::GET, MockServer};
    use serde_json::json;

    #[test]
    fn resolves_twenty_titles_with_year_and_nationality_variants() {
        let examples = [
            ("Shogun", Some("2024-02-27"), "2024_TV_series"),
            ("Doctor Who", Some("2005-03-26"), "2005_TV_series"),
            ("The Office", Some("2001-07-09"), "British_TV_series"),
            ("Ghosts", Some("2019-04-15"), "British_TV_series"),
            ("The Crown", Some("2016-11-04"), "TV_series"),
            ("Fleabag", Some("2016-07-21"), "British_TV_series"),
            ("Derry Girls", Some("2018-01-04"), "British_TV_series"),
            ("Taskmaster", Some("2015-07-28"), "British_TV_series"),
            ("Broadchurch", Some("2013-03-04"), "British_TV_series"),
            ("Sherlock", Some("2010-07-25"), "British_TV_series"),
            ("The Bear", Some("2022-06-23"), "TV_series"),
            ("Industry", Some("2020-11-09"), "TV_series"),
            ("Euphoria", Some("2019-06-16"), "American_TV_series"),
            ("Yellowjackets", Some("2021-11-14"), "TV_series"),
            ("Pachinko", Some("2022-03-25"), "TV_series"),
            ("Squid Game", Some("2021-09-17"), "South_Korean_TV_series"),
            ("Kingdom", Some("2019-01-25"), "South_Korean_TV_series"),
            ("Dark", Some("2017-12-01"), "TV_series"),
            ("Money Heist", Some("2017-05-02"), "Spanish_TV_series"),
            ("Lupin", Some("2021-01-08"), "French_TV_series"),
        ];
        let server = MockServer::start();
        let client = ureq::Agent::new();
        let mut found = 0;

        for (title, date, suffix) in examples {
            let slug = format!("{}_({})", title.replace(' ', "_"), suffix);
            let canonical = slug.replace('_', " ");
            let _mock = server.mock(|when, then| {
                when.method(GET).path(format!(
                    "/api/rest_v1/page/summary/{}",
                    urlencoding::encode(&slug)
                ));
                then.status(200).json_body(json!({
                    "type": "standard",
                    "description": "British television series",
                    "extract": "A television series.",
                    "titles": {"canonical": canonical}
                }));
            });
            if resolve_wiki_slug_from_base(title, date, &client, &server.base_url()).is_some() {
                found += 1;
            }
        }
        assert!(
            found as f64 / examples.len() as f64 >= 0.9,
            "resolved {found}/{}",
            examples.len()
        );
    }

    #[test]
    fn falls_back_to_search_and_validates_the_result() {
        let server = MockServer::start();
        let client = ureq::Agent::new();
        let _search = server.mock(|when, then| {
            when.method(GET)
                .path("/w/api.php")
                .query_param("action", "query")
                .query_param("list", "search");
            then.status(200).json_body(json!({
                "query": {"search": [{"title": "The Lazarus Project (British TV series)"}]}
            }));
        });
        let _summary = server.mock(|when, then| {
            when.method(GET).path(format!(
                "/api/rest_v1/page/summary/{}",
                urlencoding::encode("The_Lazarus_Project_(British_TV_series)")
            ));
            then.status(200).json_body(json!({
                "type": "standard",
                "description": "British science fiction television series",
                "extract": "A television series.",
                "titles": {"canonical": "The Lazarus Project (British TV series)"}
            }));
        });
        let found = resolve_wiki_slug_from_base(
            "The Lazarus Project",
            Some("2022-06-16"),
            &client,
            &server.base_url(),
        );
        assert_eq!(
            found.as_deref(),
            Some("The Lazarus Project (British TV series)")
        );
    }

    #[test]
    fn rejects_search_results_that_are_not_television_articles() {
        let server = MockServer::start();
        let client = ureq::Agent::new();
        let _search = server.mock(|when, then| {
            when.method(GET).path("/w/api.php");
            then.status(200).json_body(json!({
                "query": {"search": [{"title": "The Novel"}]}
            }));
        });
        let _summary = server.mock(|when, then| {
            when.method(GET).path(format!(
                "/api/rest_v1/page/summary/{}",
                urlencoding::encode("The_Novel")
            ));
            then.status(200).json_body(json!({
                "type": "standard",
                "description": "novel",
                "extract": "A book.",
                "titles": {"canonical": "The Novel"}
            }));
        });
        assert_eq!(
            resolve_wiki_slug_from_base("The Novel", None, &client, &server.base_url()),
            None
        );
    }
}
