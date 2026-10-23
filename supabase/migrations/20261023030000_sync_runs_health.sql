-- Migration: Operational Health and sync_runs Table

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
