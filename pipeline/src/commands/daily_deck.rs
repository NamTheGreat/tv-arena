use anyhow::{Context, Result};
use chrono::{Duration, NaiveDate, Utc};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use crate::clients::http::create_http_client;
use crate::clients::supabase::{fetch_deck_candidates, insert_daily_challenge};
use crate::config::Config;
use crate::models::DeckCandidate;

struct SimplePrng(u64);

impl SimplePrng {
    fn new(seed: u64) -> Self {
        Self(if seed == 0 { 0x853c49e6748fea9b } else { seed })
    }

    fn next_u32(&mut self) -> u32 {
        self.0 = self
            .0
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        (self.0 >> 32) as u32
    }

    fn index(&mut self, upper: usize) -> usize {
        let zone = (u32::MAX as u64 + 1) / upper as u64 * upper as u64;
        loop {
            let value = self.next_u32() as u64;
            if value < zone {
                return (value % upper as u64) as usize;
            }
        }
    }

    fn shuffle<T>(&mut self, slice: &mut [T]) {
        for i in (1..slice.len()).rev() {
            let j = self.index(i + 1);
            slice.swap(i, j);
        }
    }
}

fn date_to_seed(date_str: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    date_str.hash(&mut hasher);
    hasher.finish()
}

fn build_deck(candidates: &[DeckCandidate], date: &str) -> Option<Vec<String>> {
    let mut eligible: Vec<_> = candidates
        .iter()
        .filter(|c| c.current_7d_score > 0 && c.telemetry_days >= 7)
        .cloned()
        .collect();
    eligible.sort_by(|a, b| {
        a.current_7d_score
            .cmp(&b.current_7d_score)
            .then_with(|| a.id.cmp(&b.id))
    });

    // Keep one show per score. This guarantees every adjacent comparison has
    // an unambiguous answer, including after the final shuffle.
    eligible.dedup_by_key(|candidate| candidate.current_7d_score);
    if eligible.len() < 11 {
        return None;
    }

    let low_end = eligible.len() / 3;
    let mid_end = 2 * eligible.len() / 3;
    let mut rng = SimplePrng::new(date_to_seed(date));
    let mut deck = Vec::with_capacity(11);
    let mut low = eligible[..low_end].to_vec();
    let mut mid = eligible[low_end..mid_end].to_vec();
    let mut high = eligible[mid_end..].to_vec();
    rng.shuffle(&mut low);
    rng.shuffle(&mut mid);
    rng.shuffle(&mut high);
    deck.extend(low.into_iter().take(3).map(|c| c.id));
    deck.extend(mid.into_iter().take(4).map(|c| c.id));
    deck.extend(high.into_iter().take(4).map(|c| c.id));
    rng.shuffle(&mut deck);
    Some(deck)
}

pub fn run_daily_deck(config: &Config, target_date: Option<String>) -> Result<()> {
    let client = create_http_client();
    let date_str = match target_date {
        Some(date) => {
            NaiveDate::parse_from_str(&date, "%Y-%m-%d")
                .context("--date must use YYYY-MM-DD format")?;
            date
        }
        None => (Utc::now().date_naive() + Duration::days(1)).to_string(),
    };
    println!("Generating daily deck for date {}...", date_str);

    let candidates = fetch_deck_candidates(&client, config)?;
    let Some(selected_ids) = build_deck(&candidates, &date_str) else {
        eprintln!(
            "⚠️  Only {} eligible positive-score shows; need 11 distinct scores. Skipping deck for {}.",
            candidates
                .iter()
                .filter(|c| c.current_7d_score > 0 && c.telemetry_days >= 7)
                .count(),
            date_str
        );
        return Ok(());
    };

    insert_daily_challenge(&client, config, &date_str, &selected_ids)
        .context("Failed inserting daily challenge deck into Supabase")?;
    println!(
        "✓ Daily challenge deck created successfully for {}",
        date_str
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(id: usize, score: i64, days: i64) -> DeckCandidate {
        DeckCandidate {
            id: id.to_string(),
            current_7d_score: score,
            telemetry_days: days,
        }
    }

    #[test]
    fn filters_zero_scores_and_insufficient_history() {
        let mut candidates: Vec<_> = (0..11).map(|i| candidate(i, i as i64 + 1, 7)).collect();
        candidates[0].current_7d_score = 0;
        candidates[1].telemetry_days = 6;
        assert!(build_deck(&candidates, "2026-11-05").is_none());
    }

    #[test]
    fn skips_tied_score_candidates_and_pairs_are_unique() {
        let candidates: Vec<_> = (0..13)
            .map(|i| candidate(i, if i == 1 { 1 } else { i as i64 }, 8))
            .collect();
        let deck = build_deck(&candidates, "2026-11-05").unwrap();
        let picked_scores: Vec<_> = deck
            .iter()
            .map(|id| {
                candidates
                    .iter()
                    .find(|c| &c.id == id)
                    .unwrap()
                    .current_7d_score
            })
            .collect();
        assert_eq!(deck.len(), 11);
        assert!(picked_scores.windows(2).all(|pair| pair[0] != pair[1]));
    }

    #[test]
    fn too_few_eligible_distinct_scores_produce_no_deck() {
        let candidates: Vec<_> = (0..10).map(|i| candidate(i, i as i64 + 1, 7)).collect();
        assert!(build_deck(&candidates, "2026-11-05").is_none());
    }
}
