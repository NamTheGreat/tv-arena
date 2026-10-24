pub const MIN_HISTORY_DAYS: usize = 10;
pub const WINDOW_DAYS: usize = 14;

pub const WIKI_VIEWS_FLOOR: i64 = 5_000;
pub const REDDIT_COMMENTS_FLOOR: i64 = 50;

#[derive(Debug, Clone, PartialEq)]
pub struct BreakoutDetection {
    pub signal: String,
    pub value: i64,
    pub baseline_mean: f64,
    pub baseline_std: f64,
    pub pct_over_baseline: f64,
    pub reason: String,
}

/// Detects breakout anomaly on a single signal's historical values.
///
/// `history`: chronological slice of previous days (up to 14 days, excluding today).
/// `today_value`: value recorded for the current day.
/// `signal`: identifier string (e.g., "wiki_views", "reddit_comments").
/// `floor`: minimum absolute value threshold to prevent low-volume noise triggers.
pub fn detect_signal_breakout(
    history: &[i64],
    today_value: i64,
    signal: &str,
    floor: i64,
) -> Option<BreakoutDetection> {
    // 1. Require at least 10 days of history, otherwise flag nothing
    if history.len() < MIN_HISTORY_DAYS {
        return None;
    }

    // Window: up to 14 previous days
    let window = if history.len() > WINDOW_DAYS {
        &history[history.len() - WINDOW_DAYS..]
    } else {
        history
    };

    let n = window.len() as f64;
    let sum: f64 = window.iter().map(|&x| x as f64).sum();
    let mean = sum / n;

    let variance: f64 = window
        .iter()
        .map(|&x| {
            let diff = x as f64 - mean;
            diff * diff
        })
        .sum::<f64>()
        / n;

    let std = variance.sqrt();

    // 2. Minimum absolute floor
    if today_value < floor {
        return None;
    }

    let pct_over_baseline = if mean > 0.0 {
        ((today_value as f64 - mean) / mean) * 100.0
    } else {
        100.0
    };

    // 3. Guard against sigma = 0
    if std < 1e-6 {
        // If no variance in history, any value strictly above baseline and above floor is a breakout
        if today_value as f64 > mean {
            let reason = format_reason(signal, pct_over_baseline);
            return Some(BreakoutDetection {
                signal: signal.to_string(),
                value: today_value,
                baseline_mean: round_2(mean),
                baseline_std: 0.0,
                pct_over_baseline: round_2(pct_over_baseline),
                reason,
            });
        }
        return None;
    }

    // 4. Flag when today's value is above mean + 2 sigma
    let threshold = mean + 2.0 * std;
    if (today_value as f64) > threshold {
        let reason = format_reason(signal, pct_over_baseline);
        Some(BreakoutDetection {
            signal: signal.to_string(),
            value: today_value,
            baseline_mean: round_2(mean),
            baseline_std: round_2(std),
            pct_over_baseline: round_2(pct_over_baseline),
            reason,
        })
    } else {
        None
    }
}

fn round_2(val: f64) -> f64 {
    (val * 100.0).round() / 100.0
}

fn format_reason(signal: &str, pct: f64) -> String {
    let sign = if pct >= 0.0 { "+" } else { "" };
    match signal {
        "wiki_views" => {
            format!(
                "Wikipedia traffic surge ({}{:.0}% vs 14-day avg)",
                sign, pct
            )
        }
        "reddit_comments" => {
            format!(
                "Reddit discussion surge ({}{:.0}% vs 14-day avg)",
                sign, pct
            )
        }
        other => {
            format!("{} surge ({}{:.0}% vs 14-day avg)", other, sign, pct)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_short_history_never_flagged() {
        // Only 9 days of history (< 10)
        let history = vec![1000; 9];
        let result = detect_signal_breakout(&history, 100_000, "wiki_views", WIKI_VIEWS_FLOOR);
        assert!(
            result.is_none(),
            "Short history (<10 days) must never be flagged"
        );
    }

    #[test]
    fn test_flat_series_no_flag() {
        // 14 days of flat 10,000 views
        let history = vec![10_000; 14];
        let result = detect_signal_breakout(&history, 10_000, "wiki_views", WIKI_VIEWS_FLOOR);
        assert!(
            result.is_none(),
            "Flat series with same today value should not flag"
        );
    }

    #[test]
    fn test_gentle_trend_not_flagged() {
        // Gentle trend with natural daily fluctuations
        let history = vec![
            10_000, 10_300, 9_900, 10_400, 10_200, 10_600, 10_400, 10_700, 10_500, 10_800, 10_600,
            10_900, 10_700, 10_850,
        ];
        let result = detect_signal_breakout(&history, 10_800, "wiki_views", WIKI_VIEWS_FLOOR);
        assert!(
            result.is_none(),
            "Gentle daily trend must not flag as breakout"
        );
    }

    #[test]
    fn test_spike_flagged_with_reason() {
        // Steady ~10,000 baseline
        let history = vec![
            10_000, 10_100, 9_900, 10_050, 9_950, 10_150, 10_000, 10_020, 9_980, 10_050, 10_000,
            10_010, 9_990, 10_000,
        ];
        // 4x spike to 41,000
        let result = detect_signal_breakout(&history, 41_000, "wiki_views", WIKI_VIEWS_FLOOR);
        assert!(result.is_some());
        let detection = result.unwrap();
        assert_eq!(detection.signal, "wiki_views");
        assert_eq!(detection.value, 41_000);
        assert!(detection.pct_over_baseline > 300.0);
        assert!(detection.reason.contains("Wikipedia traffic surge (+309%"));
    }

    #[test]
    fn test_zero_variance_with_spike() {
        // Exactly identical values for 14 days (sigma = 0)
        let history = vec![10_000; 14];
        let result = detect_signal_breakout(&history, 25_000, "wiki_views", WIKI_VIEWS_FLOOR);
        assert!(result.is_some());
        let detection = result.unwrap();
        assert_eq!(detection.baseline_std, 0.0);
        assert!(detection.pct_over_baseline > 100.0);
    }

    #[test]
    fn test_floor_behavior_prevents_low_volume_noise() {
        // Baseline 20 views jumping to 100 (technically high sigma, but below 5000 floor)
        let history = vec![20; 14];
        let result = detect_signal_breakout(&history, 100, "wiki_views", WIKI_VIEWS_FLOOR);
        assert!(result.is_none(), "Must not flag when below absolute floor");

        // For reddit comments, 100 is above REDDIT_COMMENTS_FLOOR (50)
        let reddit_history = vec![5; 14];
        let reddit_result = detect_signal_breakout(
            &reddit_history,
            80,
            "reddit_comments",
            REDDIT_COMMENTS_FLOOR,
        );
        assert!(reddit_result.is_some());
        assert!(reddit_result
            .unwrap()
            .reason
            .contains("Reddit discussion surge"));
    }
}
