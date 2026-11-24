//! Shared rate limiting and retry/backoff for the optional secondary signal clients.
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// Why a secondary signal request failed. `QuotaExhausted` and `Unauthorized` are terminal for the
/// whole run, so callers stop issuing requests for that source instead of burning more quota.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FetchError {
    QuotaExhausted,
    Unauthorized,
    Failed(String),
}

impl std::fmt::Display for FetchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FetchError::QuotaExhausted => write!(f, "request quota exhausted"),
            FetchError::Unauthorized => write!(f, "credentials rejected"),
            FetchError::Failed(msg) => write!(f, "{}", msg),
        }
    }
}

impl std::error::Error for FetchError {}

#[derive(Debug, Clone, Copy)]
pub struct RetryPolicy {
    pub max_attempts: u32,
    pub base_delay: Duration,
    pub max_delay: Duration,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            max_attempts: 4,
            base_delay: Duration::from_secs(2),
            max_delay: Duration::from_secs(60),
        }
    }
}

impl RetryPolicy {
    /// Delay before retry number `attempt` (1-based). A server hint (Retry-After or a rate limit
    /// reset) wins over exponential backoff, but both are capped at `max_delay`.
    pub fn delay(&self, attempt: u32, server_hint: Option<Duration>) -> Duration {
        let exp = self
            .base_delay
            .saturating_mul(2u32.saturating_pow(attempt.saturating_sub(1)));
        server_hint.unwrap_or(exp).min(self.max_delay)
    }
}

/// Spaces requests at least `min_interval` apart.
pub struct RateLimiter {
    min_interval: Duration,
    last: Mutex<Option<Instant>>,
}

impl RateLimiter {
    pub fn new(min_interval: Duration) -> Self {
        Self {
            min_interval,
            last: Mutex::new(None),
        }
    }

    pub fn wait(&self) {
        let mut last = self.last.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(previous) = *last {
            let elapsed = previous.elapsed();
            if elapsed < self.min_interval {
                thread::sleep(self.min_interval - elapsed);
            }
        }
        *last = Some(Instant::now());
    }
}

/// Parse `Retry-After` (seconds) or an epoch-seconds reset header such as `x-rate-limit-reset`.
pub fn server_hint(retry_after: Option<&str>, reset_epoch: Option<&str>) -> Option<Duration> {
    if let Some(secs) = retry_after.and_then(|v| v.trim().parse::<u64>().ok()) {
        return Some(Duration::from_secs(secs));
    }
    let reset = reset_epoch.and_then(|v| v.trim().parse::<u64>().ok())?;
    let now = SystemTime::now().duration_since(UNIX_EPOCH).ok()?.as_secs();
    Some(Duration::from_secs(reset.saturating_sub(now)))
}

/// GET a JSON document, pacing requests and retrying 429s, 5xx responses and transport errors.
/// 401/403 map to `Unauthorized`; other 4xx responses fail immediately.
pub fn get_json_with_retry(
    agent: &ureq::Agent,
    url: &str,
    headers: &[(&str, &str)],
    policy: &RetryPolicy,
    limiter: &RateLimiter,
) -> Result<serde_json::Value, FetchError> {
    let mut last_error = String::from("no attempts made");
    for attempt in 1..=policy.max_attempts.max(1) {
        limiter.wait();
        let mut request = agent.get(url);
        for (name, value) in headers {
            request = request.set(name, value);
        }
        match request.call() {
            Ok(response) => {
                return response
                    .into_json::<serde_json::Value>()
                    .map_err(|e| FetchError::Failed(format!("invalid JSON: {}", e)));
            }
            Err(ureq::Error::Status(code @ (401 | 403), _)) => {
                let _ = code;
                return Err(FetchError::Unauthorized);
            }
            Err(ureq::Error::Status(code, response)) if code == 429 || code >= 500 => {
                last_error = format!("HTTP {}", code);
                let hint = server_hint(
                    response.header("retry-after"),
                    response.header("x-rate-limit-reset"),
                );
                if attempt == policy.max_attempts.max(1) {
                    if code == 429 {
                        return Err(FetchError::QuotaExhausted);
                    }
                    break;
                }
                thread::sleep(policy.delay(attempt, hint));
            }
            Err(ureq::Error::Status(code, _)) => {
                return Err(FetchError::Failed(format!("HTTP {}", code)));
            }
            Err(e) => {
                last_error = e.to_string();
                if attempt == policy.max_attempts.max(1) {
                    break;
                }
                thread::sleep(policy.delay(attempt, None));
            }
        }
    }
    Err(FetchError::Failed(last_error))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exponential_delay_is_capped() {
        let policy = RetryPolicy {
            max_attempts: 5,
            base_delay: Duration::from_secs(2),
            max_delay: Duration::from_secs(10),
        };
        assert_eq!(policy.delay(1, None), Duration::from_secs(2));
        assert_eq!(policy.delay(2, None), Duration::from_secs(4));
        assert_eq!(policy.delay(3, None), Duration::from_secs(8));
        assert_eq!(policy.delay(4, None), Duration::from_secs(10));
    }

    #[test]
    fn server_hint_overrides_but_is_capped() {
        let policy = RetryPolicy::default();
        assert_eq!(
            policy.delay(1, Some(Duration::from_secs(7))),
            Duration::from_secs(7)
        );
        assert_eq!(
            policy.delay(1, Some(Duration::from_secs(900))),
            policy.max_delay
        );
    }

    #[test]
    fn parses_retry_after_and_reset_headers() {
        assert_eq!(server_hint(Some(" 5 "), None), Some(Duration::from_secs(5)));
        assert_eq!(server_hint(Some("soon"), None), None);
        let past = server_hint(None, Some("1")).unwrap();
        assert_eq!(past, Duration::from_secs(0));
        let future = (SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + 30)
            .to_string();
        let hint = server_hint(None, Some(&future)).unwrap();
        assert!(hint.as_secs() >= 28 && hint.as_secs() <= 30);
    }

    #[test]
    fn rate_limiter_spaces_requests() {
        let limiter = RateLimiter::new(Duration::from_millis(60));
        let start = Instant::now();
        limiter.wait();
        limiter.wait();
        assert!(start.elapsed() >= Duration::from_millis(55));
    }
}
