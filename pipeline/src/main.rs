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
    /// Discover & seed prestige TV via TMDb API (default), or parse CSV with --csv <file>
    Seed {
        #[arg(short, long)]
        csv: Option<String>,
        #[arg(short, long, default_value_t = 200)]
        limit: usize,
    },
    /// Nightly: Fetch 7d Wikipedia + Reddit telemetry and update Supabase scores
    Sync,
    /// Weekly: Fetch premiere/finale episode dates from TMDb and upsert series events
    Events,
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
        Commands::Seed { csv, limit } => commands::seed::run_seed(csv.as_deref(), limit, &config)?,
        Commands::Sync => commands::sync::run_sync(&config)?,
        Commands::Events => commands::events::run_events(&config)?,
        Commands::DailyDeck { date } => commands::daily_deck::run_daily_deck(&config, date)?,
    }

    Ok(())
}
