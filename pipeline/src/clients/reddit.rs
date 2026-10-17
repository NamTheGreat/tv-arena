use crate::models::RedditListing;

pub fn fetch_reddit_stats(
    client: &ureq::Agent,
    reddit_query: &str,
    title: &str,
) -> Option<(i64, i64)> {
    let reddit_url = format!(
        "https://www.reddit.com/r/television/search.json?q={}&restrict_sr=1&t=week&limit=100",
        urlencoding::encode(reddit_query)
    );

    let reddit_result = client
        .get(&reddit_url)
        .set(
            "User-Agent",
            "linux:tv-arena-pipeline:v0.1.0 (by /u/tv_arena_bot)",
        )
        .call();

    match reddit_result {
        Ok(r) if r.status() == 200 => r.into_json::<RedditListing>().ok().map(|l| {
            let c: i64 = l.data.children.iter().map(|p| p.data.num_comments).sum();
            let u: i64 = l.data.children.iter().map(|p| p.data.score).sum();
            (c, u)
        }),
        Ok(r) => {
            eprintln!("⚠️  Reddit returned HTTP {} for '{}'", r.status(), title);
            None
        }
        Err(ureq::Error::Status(code, _resp)) => {
            eprintln!(
                "⚠️  Reddit returned HTTP status {} for '{}' (URL: {})",
                code, title, reddit_url
            );
            None
        }
        Err(e) => {
            eprintln!("⚠️  Reddit fetch error for '{}': {}", title, e);
            None
        }
    }
}
