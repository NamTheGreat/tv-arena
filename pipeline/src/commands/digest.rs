use anyhow::{anyhow, Result};
use chrono::{Duration, Utc};

use crate::clients::{create_http_client, digest};
use crate::config::Config;

pub fn run_digest(config: &Config) -> Result<()> {
    let client = create_http_client();
    let movers = digest::fetch_movers(&client, config)?;
    let yesterday = (Utc::now() - Duration::days(1))
        .date_naive()
        .format("%Y-%m-%d")
        .to_string();
    let breakouts = digest::fetch_breakouts(&client, config, &yesterday)?;
    let message = format_digest(movers, breakouts);

    let Some(webhook_url) = config.digest_webhook_url.as_deref() else {
        println!("{message}");
        println!("Digest was not posted; set DIGEST_WEBHOOK_URL to enable delivery.");
        return Ok(());
    };

    if client
        .post(webhook_url)
        .send_json(ureq::json!({
            "content": message,
            "allowed_mentions": { "parse": [] }
        }))
        .is_err()
    {
        // Webhook URLs commonly contain credentials; keep them out of error output.
        return Err(anyhow!(
            "Digest webhook request failed; check its configuration."
        ));
    }
    println!("Daily digest posted.");
    Ok(())
}

fn format_digest(mut movers: Vec<digest::Mover>, breakouts: Vec<digest::Breakout>) -> String {
    movers.sort_by_key(|mover| std::cmp::Reverse(mover.current_7d_score - mover.previous_7d_score));

    let mut lines = vec!["TV Arena daily digest".to_string(), "".to_string()];
    let rising: Vec<_> = movers
        .into_iter()
        .filter(|mover| mover.current_7d_score > mover.previous_7d_score)
        .take(3)
        .collect();

    lines.push("Top 3 risers (last 7 days vs prior 7 days):".to_string());
    if rising.is_empty() {
        lines.push("No positive movers.".to_string());
    } else {
        for (index, mover) in rising.iter().enumerate() {
            let change = mover.current_7d_score - mover.previous_7d_score;
            lines.push(format!(
                "{}. {} (+{} points)",
                index + 1,
                mover.title,
                change
            ));
        }
    }

    lines.push(String::new());
    lines.push("Breakouts yesterday:".to_string());
    if breakouts.is_empty() {
        lines.push("No breakouts detected.".to_string());
    } else {
        for breakout in breakouts {
            let title = breakout
                .series
                .map(|series| series.title)
                .unwrap_or_else(|| "Unknown show".to_string());
            lines.push(format!(
                "- {} ({}): {:.0} — {}",
                title, breakout.signal, breakout.value, breakout.reason
            ));
        }
    }

    let message = lines.join("\n");
    if message.chars().count() <= 1900 {
        return message;
    }

    let mut truncated: String = message.chars().take(1897).collect();
    truncated.push_str("...");
    truncated
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clients::digest::{Breakout, BreakoutSeries, Mover};

    #[test]
    fn digest_lists_three_largest_positive_movers_and_breakouts() {
        let movers = [12, 75, -5, 40]
            .into_iter()
            .enumerate()
            .map(|(index, change)| Mover {
                title: format!("Show {index}"),
                current_7d_score: 100 + change,
                previous_7d_score: 100,
            })
            .collect();
        let breakouts = vec![Breakout {
            signal: "wiki_views".into(),
            value: 2400.0,
            reason: "above baseline".into(),
            series: Some(BreakoutSeries {
                title: "Show 0".into(),
            }),
        }];

        let text = format_digest(movers, breakouts);
        assert!(text.contains("1. Show 1 (+75 points)"));
        assert!(text.contains("2. Show 3 (+40 points)"));
        assert!(text.contains("3. Show 0 (+12 points)"));
        assert!(!text.contains("Show 2"));
        assert!(text.contains("Show 0 (wiki_views): 2400 — above baseline"));
    }

    #[test]
    fn digest_stays_within_discord_message_limit() {
        let movers = vec![Mover {
            title: "A".repeat(3000),
            current_7d_score: 2,
            previous_7d_score: 1,
        }];
        assert!(format_digest(movers, vec![]).chars().count() <= 1900);
    }
}
