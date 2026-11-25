use chrono::NaiveDate;
use httpmock::prelude::*;
use serde_json::json;
use std::time::Duration;
use tv_arena_pipeline::clients::backoff::{FetchError, RetryPolicy};
use tv_arena_pipeline::clients::http::create_http_client;
use tv_arena_pipeline::clients::imdb::{EpisodeRating, OmdbClient};
use tv_arena_pipeline::clients::social::XMentionsClient;
use tv_arena_pipeline::clients::tmdb::fetch_imdb_id_from;
use tv_arena_pipeline::clients::TelemetryFetcher;
use tv_arena_pipeline::commands::sync::run_sync_with_fetcher;
use tv_arena_pipeline::config::Config;
use tv_arena_pipeline::models::WikiDay;

fn fast_policy(attempts: u32) -> RetryPolicy {
    RetryPolicy {
        max_attempts: attempts,
        base_delay: Duration::from_millis(1),
        max_delay: Duration::from_millis(20),
    }
}

fn day(s: &str) -> NaiveDate {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
}

// ---------- X mentions ----------

#[test]
fn x_client_sends_bearer_token_and_a_one_day_window() {
    let server = MockServer::start();
    let mock = server.mock(|when, then| {
        when.method(GET)
            .path("/2/tweets/counts/recent")
            .header("Authorization", "Bearer secret-token")
            .query_param("granularity", "day")
            .query_param("start_time", "2026-11-23T00:00:00Z")
            .query_param("end_time", "2026-11-24T00:00:00Z")
            .query_param("query", "\"The Bear\" -is:retweet lang:en");
        then.status(200).json_body(
            json!({"data":[{"tweet_count": 1234}], "meta": {"total_tweet_count": 1234}}),
        );
    });
    let agent = create_http_client();
    let client = XMentionsClient::with_options(
        &agent,
        &server.base_url(),
        "secret-token",
        fast_policy(3),
        Duration::ZERO,
    );
    assert_eq!(
        client.daily_mentions("The Bear", day("2026-11-23")),
        Ok(1234)
    );
    mock.assert();
}

/// Minimal scripted HTTP server: answers each connection with the next canned response.
fn scripted_server(responses: Vec<String>) -> (String, std::thread::JoinHandle<()>) {
    use std::io::{Read, Write};
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let handle = std::thread::spawn(move || {
        for response in responses {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buf = [0u8; 4096];
            let _ = stream.read(&mut buf);
            stream.write_all(response.as_bytes()).unwrap();
        }
    });
    (url, handle)
}

#[test]
fn x_client_retries_throttling_then_succeeds() {
    let throttled = "HTTP/1.1 429 Too Many Requests\r\nRetry-After: 0\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_string();
    let body = r#"{"data":[{"tweet_count":42}]}"#;
    let ok = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let (url, server) = scripted_server(vec![throttled.clone(), throttled, ok]);
    let agent = create_http_client();
    let client = XMentionsClient::with_options(&agent, &url, "t", fast_policy(4), Duration::ZERO);
    assert_eq!(
        client.daily_mentions("Severance", day("2026-11-23")),
        Ok(42)
    );
    assert!(!client.is_disabled());
    server.join().unwrap();
}

#[test]
fn x_client_retries_server_errors() {
    let server = MockServer::start();
    let mock = server.mock(|when, then| {
        when.method(GET).path("/2/tweets/counts/recent");
        then.status(503);
    });
    let agent = create_http_client();
    let client = XMentionsClient::with_options(
        &agent,
        &server.base_url(),
        "t",
        fast_policy(3),
        Duration::ZERO,
    );
    let result = client.daily_mentions("Dark", day("2026-11-23"));
    assert!(matches!(result, Err(FetchError::Failed(_))));
    mock.assert_hits(3);
    // A flaky 5xx does not disable the source for the rest of the run.
    assert!(!client.is_disabled());
}

#[test]
fn x_client_stops_after_quota_exhaustion() {
    let server = MockServer::start();
    let mock = server.mock(|when, then| {
        when.method(GET).path("/2/tweets/counts/recent");
        then.status(429).header("retry-after", "0");
    });
    let agent = create_http_client();
    let client = XMentionsClient::with_options(
        &agent,
        &server.base_url(),
        "t",
        fast_policy(2),
        Duration::ZERO,
    );
    assert_eq!(
        client.daily_mentions("Dark", day("2026-11-23")),
        Err(FetchError::QuotaExhausted)
    );
    assert!(client.is_disabled());
    let hits_after_first = mock.hits();
    assert!(client.daily_mentions("Dark", day("2026-11-23")).is_err());
    assert_eq!(
        mock.hits(),
        hits_after_first,
        "a disabled client must not call the API again"
    );
}

#[test]
fn x_client_does_not_retry_rejected_credentials() {
    let server = MockServer::start();
    let mock = server.mock(|when, then| {
        when.method(GET).path("/2/tweets/counts/recent");
        then.status(401);
    });
    let agent = create_http_client();
    let client = XMentionsClient::with_options(
        &agent,
        &server.base_url(),
        "bad",
        fast_policy(4),
        Duration::ZERO,
    );
    assert_eq!(
        client.daily_mentions("Dark", day("2026-11-23")),
        Err(FetchError::Unauthorized)
    );
    mock.assert_hits(1);
    assert!(client.is_disabled());
}

// ---------- IMDb via OMDb ----------

fn omdb_client<'a>(agent: &'a ureq::Agent, server: &MockServer) -> OmdbClient<'a> {
    OmdbClient::with_options(
        agent,
        &server.base_url(),
        "omdb-key",
        fast_policy(2),
        Duration::ZERO,
    )
}

#[test]
fn omdb_returns_latest_aired_rated_episode_with_votes() {
    let server = MockServer::start();
    server.mock(|when, then| {
        when.method(GET)
            .path("/")
            .query_param("i", "tt0000001")
            .query_param("apikey", "omdb-key")
            .matches(|req| {
                !req.query_params
                    .as_ref()
                    .map(|p| p.iter().any(|(k, _)| k == "Season"))
                    .unwrap_or(false)
            });
        then.status(200)
            .json_body(json!({"Response":"True","totalSeasons":"3"}));
    });
    server.mock(|when, then| {
        when.method(GET)
            .path("/")
            .query_param("i", "tt0000001")
            .query_param("Season", "3");
        then.status(200)
            .json_body(json!({"Response":"True","Episodes":[
                {"Episode":"1","Released":"2026-11-06","imdbRating":"8.1","imdbID":"tt100"},
                {"Episode":"2","Released":"2026-11-13","imdbRating":"8.9","imdbID":"tt200"},
                {"Episode":"3","Released":"2026-11-30","imdbRating":"N/A","imdbID":"tt300"}
            ]}));
    });
    server.mock(|when, then| {
        when.method(GET).path("/").query_param("i", "tt200");
        then.status(200)
            .json_body(json!({"Response":"True","imdbVotes":"12,345"}));
    });
    let agent = create_http_client();
    let rating = omdb_client(&agent, &server)
        .latest_episode_rating("tt0000001", day("2026-11-23"))
        .unwrap();
    assert_eq!(
        rating,
        Some(EpisodeRating {
            season: 3,
            episode: 2,
            rating: 8.9,
            votes: Some(12345)
        })
    );
}

#[test]
fn omdb_falls_back_to_the_previous_season_when_the_new_one_has_no_ratings() {
    let server = MockServer::start();
    server.mock(|when, then| {
        when.method(GET)
            .path("/")
            .query_param("i", "tt0000002")
            .matches(|req| {
                !req.query_params
                    .as_ref()
                    .map(|p| p.iter().any(|(k, _)| k == "Season"))
                    .unwrap_or(false)
            });
        then.status(200)
            .json_body(json!({"Response":"True","totalSeasons":"2"}));
    });
    server.mock(|when, then| {
        when.method(GET).path("/").query_param("Season", "2");
        then.status(200).json_body(json!({"Response":"True","Episodes":[{"Episode":"1","Released":"2027-01-01","imdbRating":"N/A"}]}));
    });
    server.mock(|when, then| {
        when.method(GET).path("/").query_param("Season", "1");
        then.status(200).json_body(json!({"Response":"True","Episodes":[{"Episode":"10","Released":"2025-06-01","imdbRating":"9.1"}]}));
    });
    let agent = create_http_client();
    let rating = omdb_client(&agent, &server)
        .latest_episode_rating("tt0000002", day("2026-11-23"))
        .unwrap()
        .unwrap();
    assert_eq!(
        (rating.season, rating.episode, rating.rating, rating.votes),
        (1, 10, 9.1, None)
    );
}

#[test]
fn omdb_unknown_show_is_not_an_error() {
    let server = MockServer::start();
    server.mock(|when, then| {
        when.method(GET).path("/");
        then.status(200)
            .json_body(json!({"Response":"False","Error":"Incorrect IMDb ID."}));
    });
    let agent = create_http_client();
    let client = omdb_client(&agent, &server);
    assert_eq!(
        client.latest_episode_rating("tt0000003", day("2026-11-23")),
        Ok(None)
    );
    assert!(!client.is_disabled());
}

#[test]
fn omdb_quota_and_key_errors_disable_the_source() {
    let server = MockServer::start();
    let mock = server.mock(|when, then| {
        when.method(GET).path("/");
        then.status(200)
            .json_body(json!({"Response":"False","Error":"Request limit reached!"}));
    });
    let agent = create_http_client();
    let client = omdb_client(&agent, &server);
    assert_eq!(
        client.latest_episode_rating("tt0000004", day("2026-11-23")),
        Err(FetchError::QuotaExhausted)
    );
    assert!(client.is_disabled());
    let hits = mock.hits();
    assert!(client
        .latest_episode_rating("tt0000005", day("2026-11-23"))
        .is_err());
    assert_eq!(mock.hits(), hits);

    let bad_key = MockServer::start();
    bad_key.mock(|when, then| {
        when.method(GET).path("/");
        then.status(200)
            .json_body(json!({"Response":"False","Error":"Invalid API key!"}));
    });
    let client = omdb_client(&agent, &bad_key);
    assert_eq!(
        client.latest_episode_rating("tt0000006", day("2026-11-23")),
        Err(FetchError::Unauthorized)
    );
}

// ---------- TMDb external ids ----------

#[test]
fn tmdb_external_ids_resolve_valid_imdb_ids_only() {
    let server = MockServer::start();
    server.mock(|when, then| {
        when.method(GET).path("/3/tv/95396/external_ids");
        then.status(200).json_body(json!({"imdb_id":"tt11280740"}));
    });
    server.mock(|when, then| {
        when.method(GET).path("/3/tv/1/external_ids");
        then.status(200).json_body(json!({"imdb_id":"nm0000001"}));
    });
    server.mock(|when, then| {
        when.method(GET).path("/3/tv/2/external_ids");
        then.status(200).json_body(json!({"imdb_id":null}));
    });
    let agent = create_http_client();
    assert_eq!(
        fetch_imdb_id_from(&agent, &server.base_url(), "key", 95396)
            .unwrap()
            .as_deref(),
        Some("tt11280740")
    );
    assert_eq!(
        fetch_imdb_id_from(&agent, &server.base_url(), "key", 1).unwrap(),
        None
    );
    assert_eq!(
        fetch_imdb_id_from(&agent, &server.base_url(), "key", 2).unwrap(),
        None
    );
}

// ---------- Sync integration ----------

struct SecondaryFetcher {
    mentions: Option<i64>,
    rating: Option<EpisodeRating>,
}

impl TelemetryFetcher for SecondaryFetcher {
    fn fetch_wiki_days(
        &self,
        _slug: &str,
        _start: &str,
        end: &str,
        _title: &str,
    ) -> Option<Vec<WikiDay>> {
        let end_date = NaiveDate::parse_from_str(&end[0..8], "%Y%m%d").unwrap();
        Some(vec![WikiDay {
            timestamp: end_date.format("%Y%m%d00").to_string(),
            views: 10_000,
        }])
    }
    fn fetch_reddit_stats(&self, _q: &str, _title: &str) -> Option<(i64, i64)> {
        Some((1_000, 4_000))
    }
    fn fetch_social_mentions(&self, _title: &str, _date: &str) -> Option<i64> {
        self.mentions
    }
    fn fetch_imdb_rating(&self, _id: &str, _date: &str) -> Option<EpisodeRating> {
        self.rating.clone()
    }
    fn imdb_enabled(&self) -> bool {
        true
    }
}

fn sync_config(server: &MockServer) -> Config {
    Config {
        supabase_url: server.base_url(),
        supabase_key: "k".into(),
        tmdb_api_key: None,
        digest_webhook_url: None,
        x_bearer_token: None,
        omdb_api_key: None,
    }
}

fn mock_supabase_base(server: &MockServer) {
    server.mock(|when, then| {
        when.method(GET).path("/rest/v1/series").query_param("order", "slug.asc");
        then.status(200).json_body(json!([{
            "id": "11111111-1111-1111-1111-111111111111", "tmdb_id": 95396, "slug": "severance",
            "title": "Severance", "network": "Apple TV+", "genre_group": "Drama", "release_years": "2022",
            "chart_color": "#C66A3D", "wiki_slug": "Severance_(TV_series)", "reddit_query": "Severance"
        }]));
    });
    server.mock(|when, then| {
        when.method(GET)
            .path("/rest/v1/series")
            .query_param("select", "id,imdb_id")
            .query_param("imdb_id", "not.is.null")
            .query_param("limit", "5000");
        then.status(200).json_body(
            json!([{"id":"11111111-1111-1111-1111-111111111111","imdb_id":"tt11280740"}]),
        );
    });
    server.mock(|when, then| {
        when.method(GET).path("/rest/v1/series_daily_telemetry");
        then.status(200).json_body(json!([]));
    });
    server.mock(|when, then| {
        when.method(GET).path("/rest/v1/series_deck_candidates");
        then.status(200).json_body(json!([]));
    });
}

#[test]
fn sync_records_secondary_signals_when_available() {
    let server = MockServer::start();
    mock_supabase_base(&server);
    let insert = server.mock(|when, then| {
        when.method(POST).path("/rest/v1/series_daily_telemetry").json_body_partial(
            r#"[{"wiki_views": 10000, "social_mentions": 5400, "imdb_rating": 8.7, "imdb_votes": 2100, "imdb_episode": "S02E05"}]"#,
        );
        then.status(201);
    });
    let client = create_http_client();
    let fetcher = SecondaryFetcher {
        mentions: Some(5_400),
        rating: Some(EpisodeRating {
            season: 2,
            episode: 5,
            rating: 8.7,
            votes: Some(2_100),
        }),
    };
    assert_eq!(
        run_sync_with_fetcher(&sync_config(&server), &client, &fetcher).unwrap(),
        1
    );
    insert.assert();
}

#[test]
fn sync_omits_secondary_columns_when_sources_return_nothing() {
    let server = MockServer::start();
    mock_supabase_base(&server);
    let with_extras = server.mock(|when, then| {
        when.method(POST)
            .path("/rest/v1/series_daily_telemetry")
            .body_contains("social_mentions");
        then.status(201);
    });
    let core_only = server.mock(|when, then| {
        when.method(POST)
            .path("/rest/v1/series_daily_telemetry")
            .json_body_partial(r#"[{"wiki_views": 10000}]"#);
        then.status(201);
    });
    let client = create_http_client();
    let fetcher = SecondaryFetcher {
        mentions: None,
        rating: None,
    };
    assert_eq!(
        run_sync_with_fetcher(&sync_config(&server), &client, &fetcher).unwrap(),
        1
    );
    assert_eq!(
        with_extras.hits(),
        0,
        "no NULL placeholders for secondary signals"
    );
    core_only.assert();
}

#[test]
fn sync_still_records_core_telemetry_if_secondary_columns_are_missing() {
    let server = MockServer::start();
    mock_supabase_base(&server);
    // Unmigrated database: rows that mention the new columns are rejected.
    let rejected = server.mock(|when, then| {
        when.method(POST)
            .path("/rest/v1/series_daily_telemetry")
            .body_contains("social_mentions");
        then.status(400)
            .body(r#"{"code":"PGRST204","message":"Could not find the 'social_mentions' column"}"#);
    });
    let accepted = server.mock(|when, then| {
        when.method(POST)
            .path("/rest/v1/series_daily_telemetry")
            .json_body_partial(r#"[{"wiki_views": 10000, "reddit_comments": 1000}]"#);
        then.status(201);
    });
    let client = create_http_client();
    let fetcher = SecondaryFetcher {
        mentions: Some(10),
        rating: None,
    };
    assert_eq!(
        run_sync_with_fetcher(&sync_config(&server), &client, &fetcher).unwrap(),
        1
    );
    rejected.assert_hits(1);
    accepted.assert_hits(1);
}
