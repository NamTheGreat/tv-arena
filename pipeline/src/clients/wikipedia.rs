use crate::engine::is_tv_description;
use crate::models::{WikiDay, WikiPageviews};

pub fn resolve_wiki_slug(title: &str, client: &ureq::Agent) -> Option<String> {
    let base = title.replace(' ', "_");
    let candidates = [
        format!("{}_(TV_series)", base),
        format!("{}_(American_TV_series)", base),
        format!("{}_(miniseries)", base),
        base.clone(),
    ];

    for slug in &candidates {
        let url = format!(
            "https://en.wikipedia.org/api/rest_v1/page/summary/{}",
            urlencoding::encode(slug)
        );
        if let Ok(res) = client.get(&url).set("User-Agent", "TVArenaRust/1.0").call() {
            if res.status() == 200 {
                if let Ok(body) = res.into_json::<serde_json::Value>() {
                    if body.get("type").and_then(|t| t.as_str()) == Some("standard") {
                        let desc = body
                            .get("description")
                            .and_then(|d| d.as_str())
                            .unwrap_or("");
                        let extract = body.get("extract").and_then(|e| e.as_str()).unwrap_or("");

                        if is_tv_description(desc, extract, slug) {
                            if let Some(canonical) =
                                body.pointer("/titles/canonical").and_then(|c| c.as_str())
                            {
                                return Some(canonical.to_string());
                            }
                            return Some(slug.to_string());
                        }
                    }
                }
            }
        }
    }

    // Fallback: Query Wikipedia Search API if direct slug guessing misses disambiguation titles
    let search_url = format!(
        "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={}+television&format=json&utf8=1",
        urlencoding::encode(title)
    );
    if let Ok(res) = client
        .get(&search_url)
        .set("User-Agent", "TVArenaRust/1.0")
        .call()
    {
        if res.status() == 200 {
            if let Ok(body) = res.into_json::<serde_json::Value>() {
                if let Some(search_items) = body.pointer("/query/search").and_then(|s| s.as_array())
                {
                    for item in search_items.iter().take(3) {
                        if let Some(search_title) = item.get("title").and_then(|t| t.as_str()) {
                            let slug = search_title.replace(' ', "_");
                            let sum_url = format!(
                                "https://en.wikipedia.org/api/rest_v1/page/summary/{}",
                                urlencoding::encode(&slug)
                            );
                            if let Ok(sum_res) = client
                                .get(&sum_url)
                                .set("User-Agent", "TVArenaRust/1.0")
                                .call()
                            {
                                if sum_res.status() == 200 {
                                    if let Ok(sum_body) = sum_res.into_json::<serde_json::Value>() {
                                        let desc = sum_body
                                            .get("description")
                                            .and_then(|d| d.as_str())
                                            .unwrap_or("");
                                        let extract = sum_body
                                            .get("extract")
                                            .and_then(|e| e.as_str())
                                            .unwrap_or("");

                                        if is_tv_description(desc, extract, &slug) {
                                            if let Some(canonical) = sum_body
                                                .pointer("/titles/canonical")
                                                .and_then(|c| c.as_str())
                                            {
                                                return Some(canonical.to_string());
                                            }
                                            return Some(slug);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    None
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
        Ok(r) if r.status() == 200 => r.into_json::<WikiPageviews>().ok().and_then(|w| w.items),
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
