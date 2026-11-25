-- Premiere impact: 7 days before vs the first 7 days of each season_premiere event (#195).
-- Rollback: DROP VIEW series_premiere_impact;
-- Efficiency: one indexed (series_id, recorded_date) range scan of at most 14 days per premiere event.
BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

-- Scores are derived from series_daily_scores (current score_weights), never stored daily_score.
-- Both windows need at least 4 observed days; a post window still in progress is capped at today (UTC).
-- multiplier is NULL when the pre-premiere baseline is zero.
CREATE VIEW series_premiere_impact
WITH (security_invoker = on) AS
SELECT
  e.id AS event_id,
  e.series_id,
  s.slug,
  s.title,
  s.genre_group,
  e.event_date,
  e.label,
  ROW_NUMBER() OVER (PARTITION BY e.series_id ORDER BY e.event_date)::INT AS premiere_number,
  w.pre_days,
  w.post_days,
  w.pre_avg,
  w.post_avg,
  (w.post_avg - w.pre_avg) AS delta,
  CASE WHEN w.pre_avg > 0 THEN ROUND(w.post_avg / w.pre_avg, 2) END AS multiplier
FROM series_events e
JOIN series s ON s.id = e.series_id
CROSS JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE sc.recorded_date < e.event_date)::INT AS pre_days,
    COUNT(*) FILTER (WHERE sc.recorded_date >= e.event_date)::INT AS post_days,
    ROUND(AVG(sc.daily_score) FILTER (WHERE sc.recorded_date < e.event_date), 2) AS pre_avg,
    ROUND(AVG(sc.daily_score) FILTER (WHERE sc.recorded_date >= e.event_date), 2) AS post_avg
  FROM series_daily_scores sc
  WHERE sc.series_id = e.series_id
    AND sc.recorded_date >= e.event_date - 7
    AND sc.recorded_date <= LEAST(e.event_date + 6, (now() AT TIME ZONE 'UTC')::date)
) w
WHERE e.kind = 'season_premiere'
  AND w.pre_days >= 4
  AND w.post_days >= 4;

REVOKE ALL ON series_premiere_impact FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON series_premiere_impact TO anon, authenticated;

COMMIT;
