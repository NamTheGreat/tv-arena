use anyhow::Result;
use clap::{Parser, Subcommand};
use tv_arena_pipeline::{commands, config};

#[derive(Parser)]
#[command(
    name = "tv-arena-pipeline",
    about = "Rust Seeder & Nightly Scraper for TV Arena"
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// One-time: Parse Kaggle CSV, verify Wiki slugs, and seed Supabase
    Seed {
        #[arg(short, long, default_value = "TMDB_tv_dataset_v3.csv")]
        csv: String,
        #[arg(short, long, default_value_t = 200)]
        limit: usize,
    },
    /// Nightly: Fetch 7d Wikipedia + Reddit telemetry and update Supabase scores
    Sync,
    /// Pick 11 shows for daily challenge deck and insert into Supabase
    DailyDeck {
        #[arg(short, long)]
        date: Option<String>,
    },
}

fn main() -> Result<()> {
    let config = config::load_config()?;
    let cli = Cli::parse();

    match cli.command {
        Commands::Seed { csv, limit } => commands::seed::run_seed(&csv, limit, &config)?,
        Commands::Sync => commands::sync::run_sync(&config)?,
        Commands::DailyDeck { date } => commands::daily_deck::run_daily_deck(&config, date)?,
    }

    Ok(())
}
