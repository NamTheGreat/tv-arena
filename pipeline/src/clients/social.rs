//! Social mention volume from the X (Twitter) API v2 recent tweet counts endpoint.
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use chrono::NaiveDate;
use serde_json::Value;

use super::backoff::{get_json_with_retry, FetchError, RateLimiter, RetryPolicy};

pub const X_API_BASE: &str = "https://api.x.com";
/// The recent counts endpoint allows 300 requests per 15 minutes on the lowest paid tier.
pub const X_MIN_INTERVAL: Duration = Duration::from_secs(3);

pub struct XMentionsClient<'a> {
    agent: &'a ureq::Agent,
    base_url: String,
    bearer_token: String,
    policy: RetryPolicy,
    limiter: RateLimiter,
    disabled: AtomicBool,
}

impl<'a> XMentionsClient<'a> {
    pub fn new(agent: &'a ureq::Agent, bearer_token: &str) -> Self {
        Self::with_options(
            agent,
            X_API_BASE,
            bearer_token,
            RetryPolicy::default(),
            X_MIN_INTERVAL,
        )
    }

    pub fn with_options(
        agent: &'a ureq::Agent,
        base_url: &str,
        bearer_token: &str,
        policy: RetryPolicy,
        min_interval: Duration,
    ) -> Self {
        Self {
            agent,
            base_url: base_url.trim_end_matches('/').to_string(),
            bearer_token: bearer_token.to_string(),
            policy,
            limiter: RateLimiter::new(min_interval),
            disabled: AtomicBool::new(false),
        }
    }

    /// True once credentials were rejected or the quota ran out; further calls are skipped.
    pub fn is_disabled(&self) -> bool {
        self.disabled.load(Ordering::Relaxed)
    }

    /// English, non-retweet mentions of the exact show title during the given UTC day.
    pub fn daily_mentions(&self, title: &str, date: NaiveDate) -> Result<i64, FetchError> {
        if self.is_disabled() {
            return Err(FetchError::Failed("source disabled for this run".into()));
        }
        let query = build_query(title).ok_or_else(|| FetchError::Failed("empty query".into()))?;
        let next = date
            .succ_opt()
            .ok_or_else(|| FetchError::Failed("date overflow".into()))?;
        let url = format!(
            "{}/2/tweets/counts/recent?query={}&granularity=day&start_time={}T00:00:00Z&end_time={}T00:00:00Z",
            self.base_url,
            urlencoding::encode(&query),
            date.format("%Y-%m-%d"),
            next.format("%Y-%m-%d"),
        );
        let auth = format!("Bearer {}", self.bearer_token);
        let result = get_json_with_retry(
            self.agent,
            &url,
            &[("Authorization", &auth)],
            &self.policy,
            &self.limiter,
        )
        .and_then(|json| {
            parse_counts_response(&json)
                .ok_or_else(|| FetchError::Failed("unexpected counts response".into()))
        });
        if matches!(
            result,
            Err(FetchError::QuotaExhausted) | Err(FetchError::Unauthorized)
        ) {
            self.disabled.store(true, Ordering::Relaxed);
        }
        result
    }
}

/// `"Title" -is:retweet lang:en`. Quotes, parentheses and operators inside the title are removed
/// so a title cannot change the meaning of the query.
pub fn build_query(title: &str) -> Option<String> {
    let cleaned: String = title
        .chars()
        .filter(|c| !matches!(c, '"' | '(' | ')' | '\\' | ':' | '@' | '#'))
        .collect();
    let cleaned = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let cleaned: String = cleaned.chars().take(100).collect();
    if cleaned.trim().is_empty() {
        None
    } else {
        Some(format!("\"{}\" -is:retweet lang:en", cleaned))
    }
}

/// Sum of per-bucket counts, falling back to the response total. Negative or missing data is rejected.
pub fn parse_counts_response(json: &Value) -> Option<i64> {
    if let Some(buckets) = json.get("data").and_then(Value::as_array) {
        let mut total = 0i64;
        for bucket in buckets {
            let count = bucket.get("tweet_count")?.as_i64()?;
            if count < 0 {
                return None;
            }
            total += count;
        }
        return Some(total);
    }
    json.get("meta")?
        .get("total_tweet_count")?
        .as_i64()
        .filter(|n| *n >= 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn builds_safe_quoted_queries() {
        assert_eq!(
            build_query("The Bear").as_deref(),
            Some("\"The Bear\" -is:retweet lang:en")
        );
        assert_eq!(
            build_query("  \"Evil\" (from:x) #tag @me  ").as_deref(),
            Some("\"Evil fromx tag me\" -is:retweet lang:en")
        );
        assert_eq!(build_query("  \"\"  "), None);
        assert!(build_query(&"a".repeat(500)).unwrap().len() < 130);
    }

    #[test]
    fn parses_counts() {
        assert_eq!(
            parse_counts_response(&json!({"data":[{"tweet_count":120},{"tweet_count":30}]})),
            Some(150)
        );
        assert_eq!(parse_counts_response(&json!({"data":[]})), Some(0));
        assert_eq!(
            parse_counts_response(&json!({"meta":{"total_tweet_count":77}})),
            Some(77)
        );
        assert_eq!(
            parse_counts_response(&json!({"data":[{"tweet_count":-1}]})),
            None
        );
        assert_eq!(parse_counts_response(&json!({"errors":[{}]})), None);
    }
}
