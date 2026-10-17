use anyhow::Result;
use std::env;

pub const CHART_PALETTE: [&str; 6] = [
    "#C66A3D", "#5C828C", "#C59A44", "#886F99", "#6E8761", "#A65D67",
];

#[derive(Debug, Clone)]
pub struct Config {
    pub supabase_url: String,
    pub supabase_key: String,
    pub tmdb_api_key: Option<String>,
}

pub fn load_config() -> Result<Config> {
    // Attempt loading .env.local first (local Docker dev), then fallback to .env
    dotenvy::from_filename(".env.local").ok();
    dotenvy::from_filename("../.env.local").ok();
    dotenvy::dotenv().ok();
    dotenvy::from_filename("../.env").ok();

    let raw_url = env::var("SUPABASE_URL").unwrap_or_default();
    let supabase_url = raw_url.trim().trim_end_matches('/').to_string();

    if supabase_url.is_empty() {
        eprintln!(
            "Error: SUPABASE_URL is not set or empty.\n\
             Please configure SUPABASE_URL in your .env file or GitHub Secrets.\n\
             Example: SUPABASE_URL=https://your-project-id.supabase.co"
        );
        std::process::exit(1);
    }

    if let Err(e) = url::Url::parse(&supabase_url) {
        eprintln!(
            "Error: SUPABASE_URL is not a valid absolute URL ('{}'): {}\n\
             Please provide a full URL with scheme, e.g. https://your-project.supabase.co",
            supabase_url, e
        );
        std::process::exit(1);
    }

    let raw_key = env::var("SUPABASE_SERVICE_ROLE_KEY").unwrap_or_default();
    let supabase_key = raw_key.trim().to_string();

    if supabase_key.is_empty() {
        eprintln!(
            "Error: SUPABASE_SERVICE_ROLE_KEY is not set or empty.\n\
             Please configure SUPABASE_SERVICE_ROLE_KEY in your .env file or GitHub Secrets."
        );
        std::process::exit(1);
    }

    let tmdb_api_key = env::var("TMDB_API_KEY")
        .or_else(|_| env::var("TMDB_KEY"))
        .or_else(|_| env::var("TMDB_READ_TOKEN"))
        .ok()
        .map(|k| k.trim().to_string())
        .filter(|k| !k.is_empty());

    Ok(Config {
        supabase_url,
        supabase_key,
        tmdb_api_key,
    })
}
