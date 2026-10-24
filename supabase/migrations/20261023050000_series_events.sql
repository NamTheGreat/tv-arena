-- Migration: Series Event Annotations
-- Table: series_events(id, series_id, event_date, kind, label, source, UNIQUE(series_id, event_date, kind))

CREATE TABLE IF NOT EXISTS series_events (
  id BIGSERIAL PRIMARY KEY,
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('premiere', 'finale', 'season_premiere', 'season_finale')),
  label TEXT NOT NULL,
  source TEXT DEFAULT 'tmdb',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(series_id, event_date, kind)
);

CREATE INDEX IF NOT EXISTS idx_series_events_date ON series_events(event_date);
CREATE INDEX IF NOT EXISTS idx_series_events_series ON series_events(series_id, event_date);

ALTER TABLE series_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read on series_events" ON series_events;
CREATE POLICY "Allow public read on series_events" ON series_events FOR SELECT USING (true);
