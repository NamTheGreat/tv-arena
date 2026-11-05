use httpmock::prelude::*;
use serde_json::json;
use tv_arena_pipeline::commands::digest::run_digest;
use tv_arena_pipeline::config::Config;

#[test]
fn digest_uses_leaderboard_and_recent_breakouts_then_posts_to_configured_webhook() {
    let server = MockServer::start();
    let movers = server.mock(|when, then| {
        when.method(GET)
            .path("/rest/v1/series_leaderboard")
            .query_param("select", "title,current_7d_score,previous_7d_score");
        then.status(200).json_body(json!([
            {"title":"Riser", "current_7d_score":120, "previous_7d_score":100},
            {"title":"Faller", "current_7d_score":80, "previous_7d_score":100}
        ]));
    });
    let breakouts = server.mock(|when, then| {
        when.method(GET)
            .path("/rest/v1/series_breakouts")
            .query_param("select", "signal,value,reason,series(title)")
            .query_param("limit", "3");
        then.status(200).json_body(json!([
            {"signal":"wiki_views", "value":2400, "reason":"above baseline", "series":{"title":"Riser"}}
        ]));
    });
    let webhook = server.mock(|when, then| {
        when.method(POST)
            .path("/webhook")
            .body_contains("TV Arena daily digest");
        then.status(204);
    });

    let config = Config {
        supabase_url: server.base_url(),
        supabase_key: "test-key".into(),
        tmdb_api_key: None,
        digest_webhook_url: Some(format!("{}/webhook", server.base_url())),
    };

    run_digest(&config).unwrap();
    let mut dry_run_config = config;
    dry_run_config.digest_webhook_url = None;
    run_digest(&dry_run_config).unwrap();
    movers.assert_hits(2);
    breakouts.assert_hits(2);
    webhook.assert_hits(1);
}
