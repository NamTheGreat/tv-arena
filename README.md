# 📺 TV Arena — Global TV Engagement Intelligence

<div align="center">

[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![Rust](https://img.shields.io/badge/Rust-1.85%2B-DEA584?style=for-the-badge&logo=rust&logoColor=black)](https://www.rust-lang.org/)

**A high-performance entertainment analytics platform and battleground comparing worldwide television engagement metrics across major networks and flagship television franchises.**

</div>

---

## 🏛️ System Architecture

TV Arena combines a modern **React 19 + TypeScript + Tailwind CSS** frontend with a high-throughput **Rust ETL pipeline** backed by a **Supabase PostgreSQL** database with Row-Level Security (RLS), dynamic SQL scoring views, and automated GitHub Actions workflows for nightly telemetry sync and zero-CSV catalog discovery.

```text
                    ┌─────────────────────────┐
                    │    TMDb API (v3 / v4)   │ ◄── Automated Discovery & Milestone Events
                    │  (Discover TV Series)   │     (Fallback: Kaggle TMDB CSV)
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │  Rust Pipeline CLI      │ ◄── Wikipedia REST API (Pageviews)
                    │  (tv-arena-pipeline)    │ ◄── Reddit Search API (Discussions & Sentiment)
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────────────────────────┐
                    │             Supabase PostgreSQL              │
                    │  Core Tables:                                │
                    │  - series, series_daily_telemetry            │
                    │  - daily_challenges, user_scores, profiles   │
                    │  - sync_runs, series_events, series_breakouts│
                    │  Dynamic Views & Security:                   │
                    │  - series_leaderboard (dynamic 7-day scores) │
                    │  - series_daily_scores (weighted raw signals)│
                    │  - series_recent_telemetry (array-aggregated)│
                    │  - submit_daily_score() RPC & Profile RLS    │
                    └──────────────────────┬───────────────────────┘
                                           │ Public Read (RLS) & Auth
                                           ▼
                    ┌──────────────────────────────────────────────┐
                    │            React 19 + Vite + TS              │
                    │  - 1v1 Arena Tug-of-War                      │
                    │  - Global Leaderboard (with "NEW" badges)    │
                    │  - Interactive Trajectory Workbench (Presets,│
                    │    Milestone Overlays, 200-Show Pinning)     │
                    │  - Daily Challenge Trivia & Verified Streaks │
                    │  - Pipeline Operational Health Modal         │
                    └──────────────────────────────────────────────┘
```

---

## ✨ Features & Dashboard Modes

### 1. ⚔️ The Arena (1v1 Head-to-Head Comparison)
- Interactive contender selector with live search filtering, auto-closing dropdowns, and instant show swapping.
- Dynamic tug-of-war bar visualizing engagement splits between any two series.
- Instant differential calculation showing absolute volume and percentage margins.

### 2. 🏆 Global Leaderboard
- Real-time ranking of television properties computed dynamically via the `series_leaderboard` SQL view.
- Rolling 7-day windows anchored to the latest telemetry date to eliminate day-boundary bias.
- Platform filtering (Netflix, HBO, Apple TV+, Prime Video, Hulu, Disney+, FX, etc.) and genre isolation.
- Proportional telemetry bars and trend indicators (`▲ Up`, `▼ Down`, `Steady`, or bold `NEW` badges for newly debuted shows with no prior week history).
- Deterministic rank tie-breaking (`ORDER BY current_7d_score DESC, title ASC`).

### 3. 📈 Interactive Trajectory Workbench (`/charts`)
- Zero-dependency mathematical vector charting rendered on a high-precision SVG coordinate grid.
- **Quick Presets:** Instant multi-series battle views (*Flagships*, *Streamer Wars*, *Drama Heavyweights*, *Breakouts*, *Netflix*, *HBO*, *Apple TV+*).
- **200-Show Catalog Popover:** Search and pin up to 8 concurrent series with direct color-coded lines and active show chips.
- **Show Focus & Isolation:** Single-click any show chip or trajectory line to isolate that series while softly dimming contenders; click again or clear to restore full view.
- **Time Ranges:** Responsive `7D`, `30D`, `90D`, and `All-Time` ranges with URL synchronization (`/charts?range=90D&slug=severance`).
- **Milestone Event Overlays:** TMDb-powered markers on the trajectory curves showing Season Premieres, Season Finales, and Series Finales.
- **Breakout Anomaly Detection:** Anomaly detection engine flagging rapid engagement spikes with `🔥 Breakout` badges.

### 4. 🎯 Daily Challenge & User Profiles (`/guess`)
- Daily curated 10-pair challenge deck generated at 00:00 UTC (`daily_challenges`).
- Player guesses whether show B has higher or lower 7-day engagement than show A.
- Supabase Authentication (Google OAuth & Email/Password) with server-side profile persistence (`profiles`).
- **Anti-Cheat Scoring RPC:** Scores verified and calculated server-side via `submit_daily_score(p_date, p_answers)`, enforcing UTC submission windows and preventing duplicate daily entries.
- Column-level security restricting user modifications on `profiles` to `username` and `display_name`, protecting streak records (`current_streak`, `best_streak`) from client tampering.

### 5. 🩺 Pipeline Operational Health
- Real-time database health modal (`DatabaseStatusCard`) accessible directly from the header status pill.
- Inspects `sync_runs` table reporting last sync run timestamp, status (`Healthy / Success`, `Partial Sync`, `Sync Failed`), duration, shows updated, and individual `wiki_failures` / `reddit_failures` counters.
- Countdown timer tracking the next scheduled 06:00 UTC sync run.
- Automatic degradation warnings if the dynamic leaderboard view encounters an error and falls back to static series cache.

---

## 📁 Repository Structure

```
.
├── .github/
│   └── workflows/
│       ├── ci.yml                # CI Quality Gates: Vite build, Rust fmt/clippy/test, Postgres 15 migration replay & smoke tests
│       ├── nightly-sync.yml      # Daily automated telemetry ETL cron (06:00 UTC)
│       └── seed-catalog.yml      # TMDb auto-discover catalog seeding workflow
├── functions/                    # Cloudflare Pages edge functions
│   ├── arena/[a]/[b].ts          # Dynamic SSR OpenGraph meta tag injector
│   └── og/[a]/[b].ts             # On-the-fly 1200x630 social preview card generator
├── src/
│   ├── App.tsx                   # Primary application router, telemetry loader, & modal orchestrator
│   ├── components/
│   │   ├── ArenaContenders.tsx   # 1v1 battleground comparison & tug-of-war
│   │   ├── AuthModal.tsx         # Supabase Auth modal (Sign In / Sign Up)
│   │   ├── DatabaseStatusCard.tsx# Pipeline operational health & setup card
│   │   ├── LeaderboardTable.tsx  # Dynamic rankings table with platform/genre filters
│   │   ├── ShowDetailView.tsx    # Dedicated individual show page with 7D sparkline
│   │   ├── TrajectoryChart.tsx   # Interactive trajectory workbench, presets, & catalog popover
│   │   ├── TriviaGame.tsx        # Daily challenge Higher/Lower game & streak view
│   │   └── UserProfileDropdown.tsx# User profile menu, streak stats, & sign-out
│   ├── lib/
│   │   ├── auth.tsx              # Supabase Auth React context & session listener
│   │   ├── database.types.ts     # Generated Supabase TypeScript database schema & view types
│   │   ├── supabase.ts           # PostgREST client configuration
│   │   └── svgMath.ts            # Mathematical coordinate transformations for SVG lines
│   └── test/                     # Vitest component & mathematical unit test suite
├── supabase/
│   ├── schema.sql                # Complete idempotent PostgreSQL schema, tables, views, RLS, and RPCs
│   ├── migrations/               # Sequential version-controlled migrations (Postgres 15)
│   └── tests/
│       └── smoke.sql             # SQL smoke test suite verifying views, RPCs, and RLS in CI
└── pipeline/
    ├── Cargo.toml                # Rust CLI dependencies (ureq, clap, chrono, serde)
    └── src/
        ├── clients/              # HTTP clients for TMDb, Wikipedia, Reddit, and Supabase
        ├── commands/             # CLI commands: seed (TMDb auto-discover) & sync (telemetry ETL)
        └── engine/               # Anomaly detection & scoring engine unit tests
```

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js**: v20.0.0 or higher
- **Rust**: 1.85.0 or higher with Cargo
- **Supabase Account**: Required for real streaming telemetry and PostgreSQL storage
- **TMDb API Key**: Required for catalog discovery and milestone event sync

---

### Frontend Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/NamTheGreat/tv-arena.git
   cd tv-arena
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` to include your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-public-anon-key
   ```
   *(Note: When unconfigured, the application presents a clear connection guide rather than masking missing infrastructure with fake data).*

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Launch the development server:**
   ```bash
   npm run dev
   ```
   Open your browser at `http://localhost:5173`.

5. **Run test suite & typecheck:**
   ```bash
   npm test
   npm run build
   ```

---

### Database Setup (Supabase)

You can provision your Supabase database using either the all-in-one schema or sequential migrations:

1. **All-in-One Setup (Fresh Database):**
   - Open your Supabase project dashboard at [supabase.com](https://supabase.com).
   - Navigate to the **SQL Editor**.
   - Paste and execute [`supabase/schema.sql`](supabase/schema.sql).

2. **Migration Replay (Existing Database):**
   - Apply the files in [`supabase/migrations/`](supabase/migrations/) sequentially in timestamp order.
   - All migrations include cascade replacements, column-level security on profiles, and pre-aggregated views.

3. **Verify Database Integrity:**
   - Run the smoke test suite in [`supabase/tests/smoke.sql`](supabase/tests/smoke.sql) to assert that views, scoring aliases, and RLS privileges are properly configured.

---

### Rust ETL Pipeline

The Rust pipeline supports automated API catalog discovery and scheduled nightly telemetry synchronization:

```bash
cd pipeline
```

1. **Configure pipeline credentials:**
   Create `pipeline/.env`:
   ```env
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret-key
   TMDB_API_KEY=your-tmdb-api-key-or-bearer-token
   ```
   *(Supports both TMDb v3 32-character API keys and v4 Bearer JWT tokens).*

2. **TMDb Auto-Discover Catalog Seeding (Primary):**
   ```bash
   cargo run --release -- seed --limit 200
   ```
   - Auto-discovers high-engagement series from TMDb's `/discover/tv` endpoint (filtered by rating, vote threshold, and language).
   - Resolves network provenance, genres, release years, and Wikipedia slugs.
   - Includes retry caps (max 3 retries per page with linear backoff), rate limiting, and instant bail-out on 401/403 credentials issues.
   - *Legacy CSV Fallback:* `cargo run --release -- seed --csv path/to/TMDB_tv_dataset_v3.csv --limit 200` is also supported.

3. **Telemetry Synchronization:**
   ```bash
   cargo run --release -- sync
   ```
   - Fetches 7-day rolling pageview statistics from Wikipedia.
   - Queries Reddit `/r/television` discussions for comment velocity and upvote sentiment.
   - Records anomalies and breakout flags in `series_breakouts`.
   - Fetches milestone premiere and finale events via TMDb into `series_events`.
   - Records execution status, duration, and failure counts into `sync_runs`.

4. **Wikipedia History Backfill:**
   ```bash
   cargo run --release -- backfill --days 90
   cargo run --release -- backfill --days 90 --slug severance
   ```
   - Fetches up to 90 completed days per Wikipedia article, ending yesterday UTC.
   - Inserts only missing dates and leaves Reddit metrics NULL/unobserved. Re-running is safe.
   - Run explicitly after catalog seeding; it is not coupled to regular seeding or nightly sync so a large batch cannot delay those jobs.

---

## ⚙️ Automated Workflows & CI Quality Gates

The repository contains three primary GitHub Actions workflows:

1. **CI Quality Gates ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):**
   - Runs on every push and PR to `dev` and `main`.
   - **Frontend:** TypeScript typecheck, Vite production build, and 39 Vitest unit tests.
   - **Rust Pipeline:** Formatting (`cargo fmt --check`), linting (`cargo clippy -- -D warnings`), and 20 unit/integration tests.
   - **Database Migration Replay (Postgres 15):** Starts a live PostgreSQL 15 service container, replays all migrations sequentially from scratch, and runs the [`supabase/tests/smoke.sql`](supabase/tests/smoke.sql) verification suite.
   - **Schema Equivalence:** Provisions a second fresh database from [`supabase/schema.sql`](supabase/schema.sql) and verifies identical smoke test passes.

2. **Nightly Telemetry Sync ([`.github/workflows/nightly-sync.yml`](.github/workflows/nightly-sync.yml)):**
   - Executes daily at 06:00 UTC (`0 6 * * *`).
   - Syncs Wikipedia pageviews, Reddit discussions, and milestone events for all active series.

3. **Catalog Seeder ([`.github/workflows/seed-catalog.yml`](.github/workflows/seed-catalog.yml)):**
   - Manual workflow dispatch with configurable limit (default `5` for smoke tests, up to `200` for full catalog expansion).
   - Hardened with a 30-minute timeout and `contents: read` permissions.

---

## ⚡ Cloudflare Pages & Dynamic OpenGraph Battle Cards

TV Arena uses Cloudflare Pages Functions to serve edge-rendered OpenGraph metadata and dynamic battle cards for social sharing:

### Edge Endpoints:
- `/arena/:a/:b`: Server-side injects dynamic OG and Twitter metadata into `index.html` (e.g. `The Boys vs Fallout | TV Arena Battle`) while preserving full Single-Page-Application client capabilities.
- `/og/:a/:b`: Generates an on-the-fly 1200x630 battle card PNG using `workers-og` featuring both contender titles, live 7-day buzz scores (aliasing `current_7d_score`), and an engagement momentum bar.

### Cloudflare Environment Variables:
Configure these in **Cloudflare Pages > Settings > Environment variables**:
- `VITE_SUPABASE_URL` / `SUPABASE_URL`: Your Supabase project URL (e.g. `https://xyz.supabase.co`).
- `VITE_SUPABASE_ANON_KEY` / `SUPABASE_ANON_KEY`: Your Supabase public anonymous API key.

### Local Edge Function Testing:
```bash
npm run build
npx wrangler pages dev dist --port 8788
curl -s -A "Twitterbot" http://localhost:8788/arena/the-boys/fallout
curl -s http://localhost:8788/og/the-boys/fallout | file -
```

---

## 🎨 Design System

- **Color Palette**:
  - `Terracotta`: `#C66A3D` / `#B25A30` (Primary Accent)
  - `Sage`: `#718B69` / `#5F7658` (Secondary Contender)
  - `Parchment / Cream`: `#F7F4EC` / `#FFFDF9` (Organic Warm Surfaces)
  - `Charcoal`: `#211E1C` (High-contrast editorial typography)
- **Typography**:
  - Headings: `Newsreader`, `Cormorant Garamond` (Editorial Serif)
  - UI & Data: `Plus Jakarta Sans` with `font-tabular` for numerical stability
