use httpmock::prelude::*;
use serde_json::json;
use tv_arena_pipeline::clients::http::create_http_client;
use tv_arena_pipeline::clients::TelemetryFetcher;
use tv_arena_pipeline::commands::sync::run_sync_with_fetcher;
use tv_arena_pipeline::config::Config;
use tv_arena_pipeline::models::WikiDay;

struct MockTelemetry {
    wiki_views: i64,
    reddit_comments: i64,
    reddit_upvotes: i64,
}

impl TelemetryFetcher for MockTelemetry {
    fn fetch_wiki_days(
        &self,
        _wiki_slug: &str,
        _start_str: &str,
        _end_str: &str,
        _title: &str,
    ) -> Option<Vec<WikiDay>> {
        let daily_views = self.wiki_views / 7;
        Some(
            (0..7)
                .map(|i| WikiDay {
                    timestamp: format!("2026102{}", i),
                    views: daily_views,
                })
                .collect(),
        )
    }

    fn fetch_reddit_stats(&self, _reddit_query: &str, _title: &str) -> Option<(i64, i64)> {
        Some((self.reddit_comments, self.reddit_upvotes))
    }
}

#[test]
fn test_sync_full_run_against_mock_server() {
    let server = MockServer::start();

    // 1. Mock series list from Supabase
    let series_mock = server.mock(|when, then| {
        when.method(GET)
            .path("/rest/v1/series")
            .query_param("select", "*")
            .query_param("order", "buzz_score.desc");
        then.status(200).json_body(json!([
            {
                "id": "11111111-1111-1111-1111-111111111111",
                "tmdb_id": 95396,
                "slug": "severance",
                "title": "Severance",
                "network": "Apple TV+",
                "genre_group": "Drama & Sci-Fi",
                "release_years": "2024–2025",
                "chart_color": "#C66A3D",
                "wiki_slug": "Severance_(TV_series)",
                "reddit_query": "Severance",
                "buzz_score": 100000,
                "delta_pct": 0.0
            }
        ]));
    });

    // 2. Mock prior day telemetry query
    let prior_telemetry_mock = server.mock(|when, then| {
        when.method(GET)
            .path("/rest/v1/series_daily_telemetry")
            .query_param("series_id", "eq.11111111-1111-1111-1111-111111111111");
        then.status(200).json_body(json!([]));
    });

    // 3. Mock series PATCH score update: expected score = (70000*10) + (1000*150) + (4000*25) = 950,000
    let patch_mock = server.mock(|when, then| {
        when.method("PATCH")
            .path("/rest/v1/series")
            .query_param("id", "eq.11111111-1111-1111-1111-111111111111")
            .json_body_partial(r#"{"buzz_score": 950000}"#);
        then.status(200).json_body(json!({}));
    });

    // 4. Mock daily telemetry batch insertion
    let telemetry_batch_mock = server.mock(|when, then| {
        when.method(POST)
            .path("/rest/v1/series_daily_telemetry")
            .query_param("on_conflict", "series_id,recorded_date");
        then.status(201).json_body(json!({}));
    });

    let config = Config {
        supabase_url: server.base_url(),
        supabase_key: "test-anon-key".to_string(),
        tmdb_api_key: Some("test-tmdb-key".to_string()),
    };

    let client = create_http_client();
    let mock_fetcher = MockTelemetry {
        wiki_views: 70_000,
        reddit_comments: 1_000,
        reddit_upvotes: 4_000,
    };

    let result = run_sync_with_fetcher(&config, &client, &mock_fetcher);
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), 1);

    // Verify all mock interactions were invoked with expected payloads (series fetched by sync and daily-deck, telemetry fetched for prior score and breakout detection)
    series_mock.assert_hits(2);
    prior_telemetry_mock.assert_hits(2);
    patch_mock.assert();
    telemetry_batch_mock.assert();
}
