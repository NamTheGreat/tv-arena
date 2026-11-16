-- Migration: 20261117020000_historical_ranks.sql
-- Add daily_ranks to series_recent_telemetry array aggregation view
-- Uses deterministic tie-breaking (d.daily_score DESC, s.title ASC) matching the series_leaderboard view.

SET LOCAL lock_timeout = '2s';

DROP VIEW IF EXISTS series_recent_telemetry CASCADE;

CREATE VIEW series_recent_telemetry
WITH (security_invoker = on) AS
WITH anchor AS (
  SELECT COALESCE(MAX(recorded_date), CURRENT_DATE) AS max_date
  FROM series_daily_telemetry
),
recent_scores AS (
  SELECT
    d.series_id,
    d.recorded_date,
    d.daily_score,
    ROW_NUMBER() OVER (
      PARTITION BY d.recorded_date
      ORDER BY d.daily_score DESC, s.title ASC
    ) AS daily_rank
  FROM series_daily_scores d
  JOIN series s ON s.id = d.series_id
  CROSS JOIN anchor a
  WHERE d.recorded_date > a.max_date - INTERVAL '90 days'
    AND d.recorded_date <= a.max_date
)
SELECT
  s.id AS series_id,
  COALESCE(
    array_agg(r.daily_score ORDER BY r.recorded_date ASC) FILTER (WHERE r.daily_score IS NOT NULL),
    ARRAY[]::BIGINT[]
  ) AS daily_series,
  COALESCE(
    array_agg(r.recorded_date::text ORDER BY r.recorded_date ASC) FILTER (WHERE r.recorded_date IS NOT NULL),
    ARRAY[]::TEXT[]
  ) AS daily_dates,
  COALESCE(
    array_agg(r.daily_rank ORDER BY r.recorded_date ASC) FILTER (WHERE r.daily_rank IS NOT NULL),
    ARRAY[]::BIGINT[]
  ) AS daily_ranks
FROM series s
LEFT JOIN recent_scores r ON s.id = r.series_id
GROUP BY s.id;

GRANT SELECT ON series_recent_telemetry TO anon, authenticated;
