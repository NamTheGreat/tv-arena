-- Migration: Anomaly and Breakout Detection
-- Table: series_breakouts(series_id, detected_date, signal, value, baseline_mean, baseline_std, pct_over_baseline, reason TEXT, PRIMARY KEY (series_id, detected_date, signal))

CREATE TABLE IF NOT EXISTS series_breakouts (
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  detected_date DATE NOT NULL,
  signal TEXT NOT NULL,
  value BIGINT NOT NULL,
  baseline_mean NUMERIC(12,2) NOT NULL,
  baseline_std NUMERIC(12,2) NOT NULL,
  pct_over_baseline NUMERIC(8,2) NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (series_id, detected_date, signal)
);

CREATE INDEX IF NOT EXISTS idx_series_breakouts_recent ON series_breakouts(detected_date DESC);
CREATE INDEX IF NOT EXISTS idx_series_breakouts_series ON series_breakouts(series_id, detected_date DESC);

ALTER TABLE series_breakouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read on series_breakouts" ON series_breakouts;
CREATE POLICY "Allow public read on series_breakouts" ON series_breakouts FOR SELECT USING (true);
