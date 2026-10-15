# 📺 TV Arena — Global Viewership Intelligence

<div align="center">

[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![Rust](https://img.shields.io/badge/Rust-1.85%2B-DEA584?style=for-the-badge&logo=rust&logoColor=black)](https://www.rust-lang.org/)

**A high-performance entertainment analytics platform and battleground comparing worldwide streaming viewership metrics across major networks and flagship television franchises.**

</div>

---

## 🏛️ System Architecture

TV Arena combines a modern **React 19 + TypeScript + Tailwind CSS** frontend with a high-throughput **Rust ETL pipeline** backed by a **Supabase PostgreSQL** database with Row-Level Security (RLS) and automated daily cron telemetry synchronization.

```
                    ┌─────────────────────────┐
                    │    Kaggle TMDB Dataset  │
                    │   (Historical Metadata) │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │  Rust Pipeline CLI      │ ◄── Wikipedia REST API (Pageviews)
                    │  (tv-arena-pipeline)    │ ◄── Reddit Search API (Engagement)
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Supabase PostgreSQL   │
                    │   - series              │
                    │   - series_daily_...    │
                    └────────────┬────────────┘
                                 │ Public Read (RLS)
                                 ▼
                    ┌─────────────────────────┐
                    │  React 19 + Vite + TS   │
                    │  - 1v1 Arena Tug-of-War │
                    │  - Global Leaderboard   │
                    │  - SVG Telemetry Charts │
                    │  - Higher/Lower Trivia  │
                    └─────────────────────────┘
```

---

## ✨ Features & Dashboard Modes

### 1. ⚔️ The Arena (1v1 Head-to-Head Comparison)
- Interactive contender selector with live search filtering and swap capabilities.
- Dynamic tug-of-war bar visualizing viewership splits between any two series.
- Instant differential calculation showing absolute volume and percentage margins.

### 2. 🏆 Global Leaderboard
- Real-time ranking of top television properties by measured premiere window households (28 days).
- Platform filtering (Netflix, HBO, Apple TV+, Prime Video, Hulu, Disney+, etc.) and genre isolation.
- Visual proportional telemetry bars and trend indicators (`▲ Up`, `▼ Down`, `Steady`).

### 3. 📈 Multi-Series SVG Telemetry Charts
- Lightweight zero-dependency mathematical vector charting (`1000x420` SVG coordinate grid).
- Multi-series telemetry curves with interactive hover states and 7-day retrospective data points.
- Cumulative period volume bars comparing market footprints.

### 4. 🎯 Higher / Lower Viewership Trivia
- Engaging interactive game pitting known benchmark series against challenger shows.
- Tests player intuition across **Global Premieres** and **Season Finales**.
- Streak counting with browser `localStorage` best-score persistence and instant answer feedback.

---

## 📁 Repository Structure

```
.
├── .github/
│   └── workflows/
│       └── nightly-sync.yml      # GitHub Actions daily automated cron pipeline
├── .env.example                  # Environment configuration template
├── .gitignore                    # Comprehensive multi-language ignore rules
├── index.html                    # Single Page Application HTML entrypoint
├── package.json                  # Frontend dependencies and npm scripts
├── postcss.config.js             # PostCSS configuration
├── tailwind.config.js            # Custom TV Arena warm palette & typography
├── tsconfig.json                 # Strict TypeScript configuration
├── vite.config.ts                # Vite bundler configuration
├── src/
│   ├── App.tsx                   # Primary application router & tab views
│   ├── main.tsx                  # React DOM root bootstrapping
│   ├── index.css                 # Custom background gradients & utility classes
│   ├── vite-env.d.ts             # Vite client environment typing
│   └── lib/
│       ├── supabase.ts           # Supabase client & fallback catalog (12 flagship shows)
│       └── svgMath.ts            # Mathematical coordinate transformations for SVG lines
├── supabase/
│   └── schema.sql                # Complete PostgreSQL schema, indexes, RLS, and seed data
└── pipeline/
    ├── Cargo.toml                # Rust CLI dependencies (ureq, clap, chrono, serde)
    └── src/
        └── main.rs               # Kaggle seeder and Wikipedia/Reddit nightly sync CLI
```

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **Rust**: 1.85.0 or higher with Cargo
- **Supabase Account**: (Optional, application includes an integrated 12-series offline catalog)

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
   *(Note: If left empty, the application automatically uses the offline flagship catalog seamlessly).*

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Launch the development server:**
   ```bash
   npm run dev
   ```
   Open your browser at `http://localhost:5173`.

5. **Build for production:**
   ```bash
   npm run build
   ```

---

### Database Setup (Supabase)

1. Open your Supabase project dashboard at [supabase.com](https://supabase.com).
2. Navigate to the **SQL Editor**.
3. Paste and execute the contents of [`supabase/schema.sql`](supabase/schema.sql).
   - Provisions the `series` and `series_daily_telemetry` tables.
   - Configures Full-Text Search and compound indexes.
   - Enables Row-Level Security (RLS) with public read access.
   - Seeds initial flagship series (*Stranger Things*, *House of the Dragon*, *Wednesday*, *The Last of Us*, etc.).

---

### Rust ETL Pipeline

The Rust pipeline supports both one-time bulk seeding from Kaggle datasets and scheduled nightly telemetry synchronization:

```bash
cd pipeline
```

1. **Configure pipeline credentials:**
   Create `pipeline/.env`:
   ```env
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret-key
   ```

2. **One-time Kaggle dataset seeding:**
   ```bash
   cargo run --release -- seed --csv path/to/TMDB_tv_dataset_v3.csv --limit 200
   ```
   - Filters for major broadcast networks and high-engagement titles.
   - Validates live Wikipedia slugs via the Wikimedia REST API.
   - Batches upsert records into Supabase.

3. **Manual telemetry sync:**
   ```bash
   cargo run --release -- sync
   ```
   - Fetches 7-day rolling pageview statistics from Wikipedia.
   - Queries Reddit `/r/television` discussions for comment velocity and upvote sentiment.
   - Computes weighted viewership indices and delta percentages.
   - Appends snapshot records to `series_daily_telemetry`.

---

## ⚙️ Automated Nightly Sync (CI/CD)

The repository includes a GitHub Actions workflow in [`.github/workflows/nightly-sync.yml`](.github/workflows/nightly-sync.yml) that executes daily at midnight UTC (`0 0 * * *`).

To enable:
1. Navigate to your GitHub repository **Settings > Secrets and variables > Actions**.
2. Add the following repository secrets:
   - `SUPABASE_URL`: Your Supabase API endpoint.
   - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase Service Role Secret Key.

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


