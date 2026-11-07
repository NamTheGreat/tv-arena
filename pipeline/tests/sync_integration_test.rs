use httpmock::prelude::*;
use serde_json::json;
use tv_arena_pipeline::clients::http::create_http_client;
use tv_arena_pipeline::clients::supabase::batch_record_daily_telemetry;
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
            .query_param("select", "id,tmdb_id,slug,title,network,genre_group,release_years,chart_color,wiki_slug,reddit_query")
            .query_param("order", "slug.asc");
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
                "reddit_query": "Severance"
            }
        ]));
    });

    // 2. Mock historical signal query used by breakout detection.
    let history_mock = server.mock(|when, then| {
        when.method(GET)
            .path("/rest/v1/series_daily_telemetry")
            .query_param("series_id", "eq.11111111-1111-1111-1111-111111111111");
        then.status(200).json_body(json!([]));
    });

    // 3. Only the latest observed date is inserted, with daily Reddit signals.
    let telemetry_batch_mock = server.mock(|when, then| {
        when.method(POST)
            .path("/rest/v1/series_daily_telemetry")
            .query_param("on_conflict", "series_id,recorded_date")
            .header("Prefer", "resolution=ignore-duplicates")
            .json_body_partial(
                r#"[{"wiki_views": 10000, "reddit_comments": 1000, "reddit_upvotes": 4000}]"#,
            );
        then.status(201).json_body(json!({}));
    });

    let deck_candidates_mock = server.mock(|when, then| {
        when.method(GET).path("/rest/v1/series_deck_candidates");
        then.status(200).json_body(json!([]));
    });

    let config = Config {
        supabase_url: server.base_url(),
        supabase_key: "test-anon-key".to_string(),
        tmdb_api_key: Some("test-tmdb-key".to_string()),
        digest_webhook_url: None,
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

    // Verify the sync reads history and inserts just the latest row without
    // patching denormalized scores on series.
    series_mock.assert_hits(1);
    history_mock.assert_hits(1);
    telemetry_batch_mock.assert();
    deck_candidates_mock.assert();
}

#[test]
fn test_batch_record_daily_telemetry_surfaces_http_status_and_body_on_error() {
    let server = MockServer::start();
    let mock = server.mock(|when, then| {
        when.method(POST)
            .path("/rest/v1/series_daily_telemetry")
            .query_param("on_conflict", "series_id,recorded_date")
            .header("Prefer", "resolution=ignore-duplicates");
        then.status(400)
            .header("Content-Type", "application/json")
            .body(r#"{"code":"42703","message":"column \"invalid_col\" of relation \"series_daily_telemetry\" does not exist"}"#);
    });

    let config = Config {
        supabase_url: server.base_url(),
        supabase_key: "test-anon-key".to_string(),
        tmdb_api_key: None,
        digest_webhook_url: None,
    };
    let client = create_http_client();
    let row = json!({
        "series_id": "11111111-1111-1111-1111-111111111111",
        "recorded_date": "2026-11-06",
        "wiki_views": 10000,
    });

    let err = batch_record_daily_telemetry(&client, &config, vec![row]).unwrap_err();
    let err_msg = format!("{:#}", err);
    assert!(err_msg.contains("400"));
    assert!(err_msg.contains("invalid_col"));
    assert!(err_msg.contains("does not exist"));
    mock.assert_hits(1);
}

#[test]
fn test_batch_record_daily_telemetry_handles_empty_error_body() {
    let server = MockServer::start();
    let mock = server.mock(|when, then| {
        when.method(POST).path("/rest/v1/series_daily_telemetry");
        then.status(500).body("");
    });

    let config = Config {
        supabase_url: server.base_url(),
        supabase_key: "test-anon-key".to_string(),
        tmdb_api_key: None,
        digest_webhook_url: None,
    };
    let client = create_http_client();
    let row = json!({
        "series_id": "11111111-1111-1111-1111-111111111111",
        "recorded_date": "2026-11-06",
    });

    let err = batch_record_daily_telemetry(&client, &config, vec![row]).unwrap_err();
    let err_msg = format!("{:#}", err);
    assert!(err_msg.contains("500"));
    mock.assert_hits(1);
}

#[test]
fn test_sync_telemetry_batch_failure_tracks_errors_and_fails_run() {
    let server = MockServer::start();

    // 1. Mock series list from Supabase
    let _series_mock = server.mock(|when, then| {
        when.method(GET).path("/rest/v1/series");
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
                "reddit_query": "Severance"
            }
        ]));
    });

    // 2. Mock telemetry batch insert failure with PostgREST 400 error body
    let _telemetry_batch_mock = server.mock(|when, then| {
        when.method(POST)
            .path("/rest/v1/series_daily_telemetry");
        then.status(400)
            .header("Content-Type", "application/json")
            .body(r#"{"code":"42703","message":"column \"test_col\" of relation \"series_daily_telemetry\" does not exist"}"#);
    });

    let config = Config {
        supabase_url: server.base_url(),
        supabase_key: "test-anon-key".to_string(),
        tmdb_api_key: None,
        digest_webhook_url: None,
    };

    let client = create_http_client();
    let mock_fetcher = MockTelemetry {
        wiki_views: 70_000,
        reddit_comments: 1_000,
        reddit_upvotes: 4_000,
    };

    let result = run_sync_with_fetcher(&config, &client, &mock_fetcher);
    // Since 1 of 1 show failed (>40%), run_sync_with_fetcher bails with error
    assert!(result.is_err());
    let err_msg = format!("{:#}", result.unwrap_err());
    assert!(err_msg.contains("too many telemetry fetch errors (1/1 shows failed)"));
}
