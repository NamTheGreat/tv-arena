-- Shared weekly mover rankings for the feed and prediction grading.
BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';

CREATE VIEW series_weekly_movers
WITH (security_invoker = on) AS
WITH periods AS (
  SELECT DISTINCT recorded_date AS period_start
  FROM series_daily_telemetry
), week_scores AS (
  SELECT
    w.period_start,
    t.series_id,
    SUM(d.daily_score) FILTER (
      WHERE t.recorded_date >= w.period_start AND t.recorded_date < w.period_start + 7
    ) AS current_7d_score,
    SUM(d.daily_score) FILTER (
      WHERE t.recorded_date >= w.period_start - 7 AND t.recorded_date < w.period_start
    ) AS previous_7d_score,
    COUNT(DISTINCT t.recorded_date) FILTER (
      WHERE t.recorded_date >= w.period_start AND t.recorded_date < w.period_start + 7
    ) AS current_days
  FROM periods w
  JOIN series_daily_telemetry t
    ON t.recorded_date >= w.period_start - 7 AND t.recorded_date < w.period_start + 7
  JOIN series_daily_scores d ON d.telemetry_id = t.id
  GROUP BY w.period_start, t.series_id
), eligible AS (
  SELECT
    ws.period_start,
    ws.series_id,
    ws.current_7d_score,
    ws.previous_7d_score,
    ROUND(((ws.current_7d_score - ws.previous_7d_score)::NUMERIC / ws.previous_7d_score) * 100, 2) AS delta_pct,
    s.slug,
    s.title,
    s.network
  FROM week_scores ws
  JOIN series s ON s.id = ws.series_id
  WHERE ws.current_days = 7 AND ws.previous_7d_score > 0
)
SELECT
  period_start,
  series_id,
  slug,
  title,
  network,
  current_7d_score,
  previous_7d_score,
  delta_pct,
  ROW_NUMBER() OVER (
    PARTITION BY period_start
    ORDER BY delta_pct DESC, title ASC, series_id ASC
  ) AS mover_rank,
  ROW_NUMBER() OVER (
    PARTITION BY period_start
    ORDER BY delta_pct ASC, title ASC, series_id ASC
  ) AS faller_rank
FROM eligible;

GRANT SELECT ON series_weekly_movers TO anon, authenticated;

COMMIT;
