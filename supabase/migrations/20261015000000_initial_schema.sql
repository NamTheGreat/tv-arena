-- Initial PostgreSQL Schema for TV Arena
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

-- Enable Row Level Security (RLS)
ALTER TABLE series ENABLE ROW LEVEL SECURITY;
ALTER TABLE series_daily_telemetry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on series" ON series;
CREATE POLICY "Allow public read on series" ON series FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public read on telemetry" ON series_daily_telemetry;
CREATE POLICY "Allow public read on telemetry" ON series_daily_telemetry FOR SELECT USING (true);
