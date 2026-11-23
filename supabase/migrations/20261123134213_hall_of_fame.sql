-- All-time records and hall of fame (#190).
-- Read-only aggregation view over derived daily scores (series_daily_scores) and
-- series_breakouts. Output is capped at 10 places per category, so the client reads a
-- few dozen rows. The view reads each telemetry row once (a few tens of thousands of
-- rows per year for the whole catalog); if telemetry grows past ~1M rows, back it with a
-- summary table refreshed after each sync instead.
--
-- Categories: record_day, top3_days, number_one_streak, number_one_weeks, breakout_events.
-- Rollback: DROP VIEW series_hall_of_fame;
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

CREATE VIEW series_hall_of_fame
WITH (security_invoker = on) AS
WITH scores AS (
  -- Derived daily scores only (never the stored column); future dates are ignored defensively.
  SELECT d.series_id, d.recorded_date, d.daily_score
  FROM series_daily_scores d
  WHERE d.recorded_date <= (now() AT TIME ZONE 'UTC')::date
), daily_ranked AS (
  -- Same tie-break as series_recent_telemetry: score DESC, then title ASC.
  SELECT
    sc.series_id,
    sc.recorded_date,
    ROW_NUMBER() OVER (PARTITION BY sc.recorded_date ORDER BY sc.daily_score DESC, s.title ASC) AS day_rank,
    COUNT(*) OVER (PARTITION BY sc.recorded_date) AS shows_that_day
  FROM scores sc
  JOIN series s ON s.id = sc.series_id
), best_day AS (
  -- Highest single day per show (earliest date wins a tie within a show).
  SELECT DISTINCT ON (series_id)
    series_id, daily_score AS value, recorded_date AS start_date, recorded_date AS end_date
  FROM scores
  WHERE daily_score > 0
  ORDER BY series_id, daily_score DESC, recorded_date ASC
), top3_days AS (
  -- Rank credits need at least 4 contending shows that day, otherwise "top 3" is meaningless.
  SELECT series_id, COUNT(*) AS value, MIN(recorded_date) AS start_date, MAX(recorded_date) AS end_date
  FROM daily_ranked
  WHERE day_rank <= 3 AND shows_that_day >= 4
  GROUP BY series_id
), number_one_days AS (
  SELECT
    series_id,
    recorded_date,
    recorded_date - (ROW_NUMBER() OVER (PARTITION BY series_id ORDER BY recorded_date))::INT AS island
  FROM daily_ranked
  WHERE day_rank = 1 AND shows_that_day >= 4
), number_one_streaks AS (
  -- Consecutive calendar days; a missing telemetry day or a day at another rank breaks the streak.
  SELECT series_id, COUNT(*) AS value, MIN(recorded_date) AS start_date, MAX(recorded_date) AS end_date
  FROM number_one_days
  GROUP BY series_id, island
), best_number_one_streak AS (
  SELECT DISTINCT ON (series_id) series_id, value, start_date, end_date
  FROM number_one_streaks
  ORDER BY series_id, value DESC, start_date ASC
), weekly AS (
  -- Monday-start ISO weeks; only weeks with all 7 days of data compete.
  SELECT
    date_trunc('week', sc.recorded_date::TIMESTAMP)::DATE AS week_start,
    sc.series_id,
    SUM(sc.daily_score) AS week_score
  FROM scores sc
  GROUP BY 1, 2
  HAVING COUNT(DISTINCT sc.recorded_date) = 7
), weekly_ranked AS (
  SELECT
    w.week_start,
    w.series_id,
    ROW_NUMBER() OVER (PARTITION BY w.week_start ORDER BY w.week_score DESC, s.title ASC) AS week_rank,
    COUNT(*) OVER (PARTITION BY w.week_start) AS shows_that_week
  FROM weekly w
  JOIN series s ON s.id = w.series_id
), number_one_weeks AS (
  SELECT
    series_id,
    week_start,
    week_start - ((ROW_NUMBER() OVER (PARTITION BY series_id ORDER BY week_start)) * 7)::INT AS island
  FROM weekly_ranked
  WHERE week_rank = 1 AND shows_that_week >= 4
), number_one_week_streaks AS (
  SELECT series_id, COUNT(*) AS value, MIN(week_start) AS start_date, (MAX(week_start) + 6) AS end_date
  FROM number_one_weeks
  GROUP BY series_id, island
), best_number_one_week_streak AS (
  SELECT DISTINCT ON (series_id) series_id, value, start_date, end_date
  FROM number_one_week_streaks
  ORDER BY series_id, value DESC, start_date ASC
), breakout_counts AS (
  SELECT
    series_id,
    COUNT(DISTINCT detected_date) AS value,
    MIN(detected_date) AS start_date,
    MAX(detected_date) AS end_date
  FROM series_breakouts
  WHERE detected_date <= (now() AT TIME ZONE 'UTC')::date
  GROUP BY series_id
), records AS (
  SELECT 'record_day'::TEXT AS category, series_id, value, start_date, end_date FROM best_day
  UNION ALL SELECT 'top3_days', series_id, value, start_date, end_date FROM top3_days
  UNION ALL SELECT 'number_one_streak', series_id, value, start_date, end_date FROM best_number_one_streak
  UNION ALL SELECT 'number_one_weeks', series_id, value, start_date, end_date FROM best_number_one_week_streak
  UNION ALL SELECT 'breakout_events', series_id, value, start_date, end_date FROM breakout_counts
), ordered AS (
  SELECT
    r.category,
    r.series_id,
    s.slug,
    s.title,
    s.chart_color,
    r.value::BIGINT AS value,
    r.start_date,
    r.end_date,
    -- Equal values share a rank; place is a strict order: earlier achievement, then title, then id.
    RANK() OVER (PARTITION BY r.category ORDER BY r.value DESC) AS record_rank,
    ROW_NUMBER() OVER (
      PARTITION BY r.category
      ORDER BY r.value DESC, r.end_date ASC, s.title ASC, r.series_id ASC
    ) AS place
  FROM records r
  JOIN series s ON s.id = r.series_id
)
SELECT category, place, record_rank, series_id, slug, title, chart_color, value, start_date, end_date
FROM ordered
WHERE place <= 10;

GRANT SELECT ON series_hall_of_fame TO anon, authenticated;

COMMIT;
