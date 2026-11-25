-- Market insights: weekly platform share (top 100), genre engagement and signal points (#194).
-- Rollback: DROP VIEW insights_platform_share_weekly, insights_genre_share_weekly,
--   insights_signal_points, insights_weekly_show_scores;
-- Efficiency: every view is bounded by recorded_date (26 weeks, or 7 days for signal points) and uses
-- the idx_telemetry_recorded_date index; none scans full history.
BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

-- Per show and week: average daily score over observed days (derived scores only).
-- Weeks are Monday based, bounded to the last 26 weeks, and a show needs at least 4 observed
-- days in the week to compete, so partial coverage cannot swing the macro numbers.
CREATE VIEW insights_weekly_show_scores
WITH (security_invoker = on) AS
SELECT
  sc.series_id,
  date_trunc('week', sc.recorded_date::TIMESTAMP)::DATE AS week_start,
  COUNT(*)::INT AS observed_days,
  AVG(sc.daily_score)::NUMERIC AS avg_daily_score,
  s.title,
  s.network_group,
  s.genre_group
FROM series_daily_scores sc
JOIN series s ON s.id = sc.series_id
WHERE sc.recorded_date <= (now() AT TIME ZONE 'UTC')::DATE
  AND sc.recorded_date >= date_trunc('week', (now() AT TIME ZONE 'UTC')::TIMESTAMP)::DATE - 182
GROUP BY sc.series_id, date_trunc('week', sc.recorded_date::TIMESTAMP)::DATE, s.title, s.network_group, s.genre_group
HAVING COUNT(*) >= 4;

-- Which platforms make up each week's top 100 (ties broken by title, then id).
CREATE VIEW insights_platform_share_weekly
WITH (security_invoker = on) AS
WITH ranked AS (
  SELECT
    w.*,
    ROW_NUMBER() OVER (PARTITION BY w.week_start ORDER BY w.avg_daily_score DESC, w.title ASC, w.series_id ASC) AS rn
  FROM insights_weekly_show_scores w
  WHERE w.avg_daily_score > 0
), top100 AS (
  SELECT * FROM ranked WHERE rn <= 100
)
SELECT
  week_start,
  network_group,
  COUNT(*)::INT AS shows,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY week_start), 1) AS share_pct,
  ROUND(100.0 * SUM(avg_daily_score) / SUM(SUM(avg_daily_score)) OVER (PARTITION BY week_start), 1) AS score_share_pct,
  (SUM(COUNT(*)) OVER (PARTITION BY week_start))::INT AS ranked_shows
FROM top100
GROUP BY week_start, network_group;

-- Weekly engagement by genre across every qualifying show.
CREATE VIEW insights_genre_share_weekly
WITH (security_invoker = on) AS
SELECT
  week_start,
  genre_group,
  COUNT(*)::INT AS shows,
  ROUND(SUM(avg_daily_score))::BIGINT AS total_daily_score,
  ROUND(AVG(avg_daily_score))::BIGINT AS avg_score_per_show,
  ROUND(100.0 * SUM(avg_daily_score) / SUM(SUM(avg_daily_score)) OVER (PARTITION BY week_start), 1) AS share_pct
FROM insights_weekly_show_scores
WHERE avg_daily_score > 0
GROUP BY week_start, genre_group;

-- One point per show for the correlation explorer: averages over the last 7 days. Reddit averages
-- only use days where Reddit was actually observed, so throttled days never look like zeros.
CREATE VIEW insights_signal_points
WITH (security_invoker = on) AS
SELECT
  s.id AS series_id,
  s.slug,
  s.title,
  s.network_group,
  s.genre_group,
  COUNT(*)::INT AS observed_days,
  ROUND(AVG(t.wiki_views))::BIGINT AS avg_wiki_views,
  ROUND(AVG(t.reddit_comments) FILTER (WHERE t.reddit_observed))::BIGINT AS avg_reddit_comments,
  ROUND(AVG(t.reddit_upvotes) FILTER (WHERE t.reddit_observed))::BIGINT AS avg_reddit_upvotes,
  ROUND(AVG(sc.daily_score))::BIGINT AS avg_daily_score
FROM series_daily_telemetry t
JOIN series_daily_scores sc ON sc.telemetry_id = t.id
JOIN series s ON s.id = t.series_id
WHERE t.recorded_date <= (now() AT TIME ZONE 'UTC')::DATE
  AND t.recorded_date >= (now() AT TIME ZONE 'UTC')::DATE - 6
GROUP BY s.id, s.slug, s.title, s.network_group, s.genre_group
HAVING COUNT(*) >= 4
ORDER BY AVG(sc.daily_score) DESC, s.title ASC
LIMIT 500;

REVOKE ALL ON insights_weekly_show_scores, insights_platform_share_weekly, insights_genre_share_weekly, insights_signal_points
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON insights_weekly_show_scores, insights_platform_share_weekly, insights_genre_share_weekly, insights_signal_points
  TO anon, authenticated;

COMMIT;
