use anyhow::{bail, Context, Result};
use chrono::Utc;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use crate::clients::http::create_http_client;
use crate::clients::supabase::{fetch_series, insert_daily_challenge};
use crate::config::Config;

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

    fn shuffle<T>(&mut self, slice: &mut [T]) {
        for i in (1..slice.len()).rev() {
            let j = (self.next_u32() as usize) % (i + 1);
            slice.swap(i, j);
        }
    }
}

fn date_to_seed(date_str: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    date_str.hash(&mut hasher);
    hasher.finish()
}

pub fn run_daily_deck(config: &Config, target_date: Option<String>) -> Result<()> {
    let client = create_http_client();
    let date_str = target_date.unwrap_or_else(|| Utc::now().format("%Y-%m-%d").to_string());

    println!("Generating daily deck for date {}...", date_str);

    let mut shows = fetch_series(&client, config)?;
    if shows.len() < 2 {
        bail!(
            "Insufficient shows in database (found {}). Need at least 2 to generate a deck.",
            shows.len()
        );
    }

    // Sort shows by buzz score to allow balanced tier distribution
    shows.sort_by_key(|s| s.viewers_premiere_28d);

    let seed = date_to_seed(&date_str);
    let mut prng = SimplePrng::new(seed);

    let selected_ids: Vec<String> = if shows.len() >= 11 {
        // Stratified sampling across 3 tiers: lower, middle, upper
        let n = shows.len();
        let t1 = n / 3;
        let t2 = 2 * n / 3;

        let mut low_tier = shows[0..t1].to_vec();
        let mut mid_tier = shows[t1..t2].to_vec();
        let mut high_tier = shows[t2..n].to_vec();

        prng.shuffle(&mut low_tier);
        prng.shuffle(&mut mid_tier);
        prng.shuffle(&mut high_tier);

        // Pick: 3 from low, 4 from mid, 4 from high = 11 shows
        let mut deck = Vec::new();
        deck.extend(low_tier.into_iter().take(3));
        deck.extend(mid_tier.into_iter().take(4));
        deck.extend(high_tier.into_iter().take(4));

        // Shuffle deck so rounds alternate difficulty
        prng.shuffle(&mut deck);

        deck.into_iter().filter_map(|s| s.id).collect()
    } else {
        // Fallback for smaller datasets: take all available and shuffle
        let mut deck = shows;
        prng.shuffle(&mut deck);
        deck.into_iter().filter_map(|s| s.id).collect()
    };

    if selected_ids.len() < 2 {
        bail!("Failed to extract valid series IDs for the deck");
    }

    println!(
        "Selected {} shows for daily challenge deck (date: {}). Inserting into Supabase...",
        selected_ids.len(),
        date_str
    );

    insert_daily_challenge(&client, config, &date_str, &selected_ids)
        .context("Failed inserting daily challenge deck into Supabase")?;

    println!(
        "✓ Daily challenge deck created successfully for {}",
        date_str
    );
    Ok(())
}
