-- TV Arena Complete PostgreSQL Schema + Initial Seed Data
CREATE TABLE IF NOT EXISTS series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tmdb_id INT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  network TEXT NOT NULL,
  genre_group TEXT NOT NULL DEFAULT 'Drama & Sci-Fi',
  release_years TEXT NOT NULL DEFAULT '2024–2025',
  chart_color TEXT DEFAULT '#C66A3D',
  wiki_slug TEXT NOT NULL,
  reddit_query TEXT NOT NULL,
  viewers_premiere_28d BIGINT DEFAULT 0,
  viewers_finale BIGINT DEFAULT 0,
  delta_pct NUMERIC(9,2) DEFAULT 0.0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_series_title_search ON series USING gin (to_tsvector('english', title));

CREATE TABLE IF NOT EXISTS series_daily_telemetry (
  id BIGSERIAL PRIMARY KEY,
  series_id UUID REFERENCES series(id) ON DELETE CASCADE,
  recorded_date DATE NOT NULL DEFAULT CURRENT_DATE,
  daily_viewers BIGINT NOT NULL,
  wiki_views INT DEFAULT 0,
  reddit_comments INT DEFAULT 0,
  UNIQUE (series_id, recorded_date)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_series_date ON series_daily_telemetry(series_id, recorded_date DESC);

-- Enable public read-only access for the React frontend
ALTER TABLE series ENABLE ROW LEVEL SECURITY;
ALTER TABLE series_daily_telemetry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on series" ON series;
CREATE POLICY "Allow public read on series" ON series FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public read on telemetry" ON series_daily_telemetry;
CREATE POLICY "Allow public read on telemetry" ON series_daily_telemetry FOR SELECT USING (true);

-- Seed initial flagship shows with zeroed metrics ready for telemetry sync
INSERT INTO series (tmdb_id, slug, title, network, genre_group, release_years, chart_color, wiki_slug, reddit_query, viewers_premiere_28d, viewers_finale, delta_pct)
VALUES
  (66732, 'stranger-things', 'Stranger Things', 'Netflix', 'Drama & Sci-Fi', '2024–2025', '#C66A3D', 'Stranger_Things', '"Stranger Things" (Netflix OR episode OR season)', 0, 0, 0.0),
  (119051, 'wednesday', 'Wednesday', 'Netflix', 'Drama & Sci-Fi', '2024–2025', '#5C828C', 'Wednesday_(TV_series)', '"Wednesday" (Netflix OR Jenna Ortega OR season)', 0, 0, 0.0),
  (94997, 'house-of-the-dragon', 'House of the Dragon', 'HBO', 'Drama & Sci-Fi', '2024–2025', '#C59A44', 'House_of_the_Dragon', '"House of the Dragon" (HBO OR episode OR season)', 0, 0, 0.0),
  (95396, 'severance', 'Severance', 'Apple TV+', 'Drama & Sci-Fi', '2024–2025', '#C66A3D', 'Severance_(TV_series)', '"Severance" (Apple OR Lumon OR episode)', 0, 0, 0.0),
  (100088, 'the-last-of-us', 'The Last of Us', 'HBO', 'Drama & Sci-Fi', '2024–2025', '#886F99', 'The_Last_of_Us_(TV_series)', '"The Last of Us" (HBO OR Joel OR Ellie)', 0, 0, 0.0),
  (136315, 'the-bear', 'The Bear', 'FX / Hulu', 'Comedy & Drama', '2024–2025', '#5C828C', 'The_Bear_(TV_series)', '"The Bear" (Hulu OR FX OR Carmy)', 0, 0, 0.0),
  (91239, 'bridgerton', 'Bridgerton', 'Netflix', 'Drama', '2024–2025', '#6E8761', 'Bridgerton', '"Bridgerton" (Netflix OR season OR episode)', 0, 0, 0.0),
  (111803, 'the-white-lotus', 'The White Lotus', 'HBO', 'Drama', '2024–2025', '#A65D67', 'The_White_Lotus', '"The White Lotus" (HBO OR episode OR finale)', 0, 0, 0.0),
  (76479, 'the-boys', 'The Boys', 'Prime Video', 'Drama & Sci-Fi', '2024–2025', '#C59A44', 'The_Boys_(TV_series)', '"The Boys" (Prime OR Homelander OR episode)', 0, 0, 0.0),
  (106379, 'fallout', 'Fallout', 'Prime Video', 'Drama & Sci-Fi', '2024–2025', '#6E8761', 'Fallout_(American_TV_series)', '"Fallout" (Prime OR Vault OR episode)', 0, 0, 0.0),
  (76331, 'succession', 'Succession', 'HBO', 'Drama', '2023–2024', '#886F99', 'Succession_(TV_series)', '"Succession" (HBO OR Kendall OR Roy)', 0, 0, 0.0),
  (125988, 'silo', 'Silo', 'Apple TV+', 'Drama & Sci-Fi', '2024–2025', '#5C828C', 'Silo_(TV_series)', '"Silo" (Apple OR Juliette OR episode)', 0, 0, 0.0)
ON CONFLICT (tmdb_id) DO NOTHING;


-- Operational Health and sync_runs Table
CREATE TABLE IF NOT EXISTS sync_runs (
  id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed')),
  shows_total INT DEFAULT 0,
  shows_updated INT DEFAULT 0,
  shows_failed INT DEFAULT 0,
  wiki_failures INT DEFAULT 0,
  reddit_failures INT DEFAULT 0,
  error_log TEXT,
  duration_ms INT
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_started ON sync_runs(started_at DESC);

ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read on sync_runs" ON sync_runs;
CREATE POLICY "Allow public read on sync_runs" ON sync_runs FOR SELECT USING (true);
