use httpmock::prelude::*;
use serde_json::json;
use tv_arena_pipeline::clients::http::create_http_client;
use tv_arena_pipeline::clients::supabase::insert_backfill_telemetry;
use tv_arena_pipeline::config::Config;

#[test]
fn backfill_insert_ignores_existing_series_dates() {
    let server = MockServer::start();
    let insert = server.mock(|when, then| {
        when.method(POST)
            .path("/rest/v1/series_daily_telemetry")
            .query_param("on_conflict", "series_id,recorded_date")
            .header("Prefer", "resolution=ignore-duplicates")
            .json_body_partial(
                r#"[{"recorded_date":"2026-11-03","wiki_views":1234,"reddit_comments":null,"reddit_upvotes":null}]"#,
            );
        then.status(201).json_body(json!([]));
    });
    let config = Config {
        supabase_url: server.base_url(),
        supabase_key: "test-key".to_string(),
        tmdb_api_key: None,
        digest_webhook_url: None,
    };
    let client = create_http_client();
    let row = json!({
        "series_id": "11111111-1111-1111-1111-111111111111",
        "recorded_date": "2026-11-03",
        "wiki_views": 1234,
        "reddit_comments": null,
        "reddit_upvotes": null,
        "reddit_observed": false
    });

    insert_backfill_telemetry(&client, &config, vec![row.clone()]).unwrap();
    insert_backfill_telemetry(&client, &config, vec![row]).unwrap();

    insert.assert_hits(2);
}
