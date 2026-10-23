use std::fs;
use tv_arena_pipeline::clients::reddit::parse_reddit_listing;
use tv_arena_pipeline::clients::wikipedia::parse_wiki_pageviews;
use tv_arena_pipeline::engine::scoring::{calculate_delta, compute_buzz_score};

#[test]
fn test_parse_wiki_single_day() {
    let json_str = fs::read_to_string("tests/fixtures/wiki_single_day.json")
        .expect("Failed to read wiki_single_day.json");
    let result = parse_wiki_pageviews(&json_str);
    assert!(result.is_some());
    let days = result.unwrap();
    assert_eq!(days.len(), 1);
    assert_eq!(days[0].timestamp, "2026102000");
    assert_eq!(days[0].views, 42150);
}

#[test]
fn test_parse_wiki_missing_days() {
    let json_str = fs::read_to_string("tests/fixtures/wiki_missing_days.json")
        .expect("Failed to read wiki_missing_days.json");
    let result = parse_wiki_pageviews(&json_str);
    assert!(result.is_some());
    let days = result.unwrap();
    assert_eq!(days.len(), 0);
}

#[test]
fn test_parse_wiki_zero_views() {
    let json_str = fs::read_to_string("tests/fixtures/wiki_zero_views.json")
        .expect("Failed to read wiki_zero_views.json");
    let result = parse_wiki_pageviews(&json_str);
    assert!(result.is_some());
    let days = result.unwrap();
    assert_eq!(days.len(), 1);
    assert_eq!(days[0].views, 0);
}

#[test]
fn test_parse_wiki_error_payload() {
    let json_str = fs::read_to_string("tests/fixtures/wiki_error.json")
        .expect("Failed to read wiki_error.json");
    let result = parse_wiki_pageviews(&json_str);
    assert!(result.is_none());
}

#[test]
fn test_parse_reddit_empty() {
    let json_str = fs::read_to_string("tests/fixtures/reddit_empty.json")
        .expect("Failed to read reddit_empty.json");
    let result = parse_reddit_listing(&json_str);
    assert_eq!(result, Some((0, 0)));
}

#[test]
fn test_parse_reddit_throttled() {
    let json_str = fs::read_to_string("tests/fixtures/reddit_throttled.json")
        .expect("Failed to read reddit_throttled.json");
    let result = parse_reddit_listing(&json_str);
    assert!(result.is_none());
}

#[test]
fn test_parse_reddit_high_score() {
    let json_str = fs::read_to_string("tests/fixtures/reddit_high_score.json")
        .expect("Failed to read reddit_high_score.json");
    let result = parse_reddit_listing(&json_str);
    assert_eq!(result, Some((1730, 6320)));
}

#[test]
fn test_score_computation_tiers() {
    // Zero tier
    assert_eq!(compute_buzz_score(0, 0, 0), 0);

    // Low tier
    let low = compute_buzz_score(100, 5, 10);
    assert_eq!(low, (100 * 10) + (5 * 150) + (10 * 25));

    // Mid tier
    let mid = compute_buzz_score(50_000, 2_000, 8_000);
    assert_eq!(mid, 1_000_000);

    // High tier
    let high = compute_buzz_score(500_000, 20_000, 80_000);
    assert_eq!(high, 10_000_000);
}

#[test]
fn test_delta_calculation_edge_cases() {
    assert_eq!(calculate_delta(100, 0), 0.0);
    assert_eq!(calculate_delta(150, 100), 50.0);
    assert_eq!(calculate_delta(75, 100), -25.0);
    assert_eq!(calculate_delta(100, 100), 0.0);
    assert_eq!(calculate_delta(1_000_000, 1), 99999.0); // clamped to max
}
