-- Migration: 20261122010000_defensive_anchor_guard.sql
-- Defend all rolling-window SQL views and grading functions against future-dated telemetry rows.
--
-- Root cause: a single row with recorded_date = '2099-01-01' in
-- series_daily_telemetry pushed MAX(recorded_date) forward by ~73 years,
-- shifting every 7-day and 90-day rolling window into the year 2098 and
-- excluding all legitimate telemetry. This poisoned the leaderboard scores,
-- recent telemetry arrays, signal contributions, and deck candidates.
--
-- Fix:
-- 1. Reject future-dated rows at the write boundary with a trigger on series_daily_telemetry.
-- 2. Cap the anchor at (now() AT TIME ZONE 'UTC')::date across all views and grading functions.

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

-- 1. Trigger to reject future-dated telemetry insertions and updates
-- squawk-ignore ban-replace-view-function
CREATE OR REPLACE FUNCTION check_telemetry_recorded_date()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.recorded_date > (now() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'recorded_date cannot be in the future: %', NEW.recorded_date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_telemetry_recorded_date ON series_daily_telemetry;
CREATE TRIGGER trg_check_telemetry_recorded_date
  BEFORE INSERT OR UPDATE OF recorded_date
  ON series_daily_telemetry
  FOR EACH ROW
  EXECUTE FUNCTION check_telemetry_recorded_date();

-- 2. series_leaderboard
-- Preserve the existing column order and the dynamic legacy alias handling.
-- squawk-ignore ban-replace-view-function
DO $$
DECLARE
  legacy_buzz_first BOOLEAN;
  score_columns TEXT;
BEGIN
  SELECT column_name = 'buzz_score'
  INTO legacy_buzz_first
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'series_leaderboard'
    AND ordinal_position = 9;

  IF legacy_buzz_first THEN
    score_columns := 'current_7d_score AS buzz_score, current_7d_score';
  ELSE
    score_columns := 'current_7d_score, current_7d_score AS buzz_score';
  END IF;

  EXECUTE format($view$
    CREATE OR REPLACE VIEW series_leaderboard
    WITH (security_invoker = on) AS
    WITH anchor AS (
      SELECT COALESCE(
        MAX(recorded_date) FILTER (WHERE recorded_date <= (now() AT TIME ZONE 'UTC')::date),
        (now() AT TIME ZONE 'UTC')::date
      ) AS max_date
      FROM series_daily_telemetry
    ),
    daily_buckets AS (
      SELECT
        s.id AS series_id,
        s.tmdb_id,
        s.slug,
        s.title,
        s.network,
        s.network_group,
        s.genre_group,
        s.release_years,
        s.chart_color,
        COALESCE(SUM(CASE WHEN d.recorded_date > a.max_date - INTERVAL '7 days' AND d.recorded_date <= a.max_date THEN d.daily_score ELSE 0 END), 0)::BIGINT AS current_7d_score,
        COALESCE(SUM(CASE WHEN d.recorded_date > a.max_date - INTERVAL '14 days' AND d.recorded_date <= a.max_date - INTERVAL '7 days' THEN d.daily_score ELSE 0 END), 0)::BIGINT AS previous_7d_score
      FROM series s
      CROSS JOIN anchor a
      LEFT JOIN series_daily_scores d ON s.id = d.series_id
      GROUP BY s.id, s.tmdb_id, s.slug, s.title, s.network, s.network_group, s.genre_group, s.release_years, s.chart_color, a.max_date
    )
    SELECT
      series_id AS id,
      tmdb_id,
      slug,
      title,
      network,
      genre_group,
      release_years,
      chart_color,
      %s,
      previous_7d_score,
      CASE
        WHEN previous_7d_score > 0 THEN
          ROUND(((current_7d_score - previous_7d_score)::NUMERIC / previous_7d_score::NUMERIC) * 100, 2)
        ELSE NULL
      END AS delta_pct,
      ROW_NUMBER() OVER (ORDER BY current_7d_score DESC, title ASC) AS rank,
      network_group
    FROM daily_buckets
  $view$, score_columns);
END $$;

-- 3. series_recent_telemetry
-- squawk-ignore ban-replace-view-function
CREATE OR REPLACE VIEW series_recent_telemetry
WITH (security_invoker = on) AS
WITH anchor AS (
  SELECT COALESCE(
    MAX(recorded_date) FILTER (WHERE recorded_date <= (now() AT TIME ZONE 'UTC')::date),
    (now() AT TIME ZONE 'UTC')::date
  ) AS max_date
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

-- 4. series_signal_contributions
-- squawk-ignore ban-replace-view-function
CREATE OR REPLACE VIEW series_signal_contributions
WITH (security_invoker = on) AS
WITH anchor AS (
  SELECT COALESCE(
    MAX(recorded_date) FILTER (WHERE recorded_date <= (now() AT TIME ZONE 'UTC')::date),
    (now() AT TIME ZONE 'UTC')::date
  ) AS max_date
  FROM series_daily_telemetry
)
SELECT
  s.id AS series_id,
  COALESCE(SUM(COALESCE(t.wiki_views, 0) * w.wiki_weight), 0)::NUMERIC AS wiki_contribution,
  COALESCE(SUM(
    CASE WHEN t.reddit_observed AND (t.reddit_comments IS NOT NULL OR t.reddit_upvotes IS NOT NULL)
      THEN COALESCE(t.reddit_comments, 0) * w.comment_weight + COALESCE(t.reddit_upvotes, 0) * w.upvote_weight
      ELSE 0
    END
  ), 0)::NUMERIC AS reddit_contribution,
  COUNT(t.recorded_date)::BIGINT AS telemetry_days,
  COUNT(t.recorded_date) FILTER (
    WHERE t.reddit_observed AND (t.reddit_comments IS NOT NULL OR t.reddit_upvotes IS NOT NULL)
  )::BIGINT AS reddit_observed_days,
  MAX(t.recorded_date) FILTER (WHERE t.wiki_views IS NOT NULL)::TEXT AS last_wiki_date,
  MAX(t.recorded_date) FILTER (
    WHERE t.reddit_observed AND (t.reddit_comments IS NOT NULL OR t.reddit_upvotes IS NOT NULL)
  )::TEXT AS last_reddit_date,
  COUNT(t.recorded_date) FILTER (WHERE t.wiki_views IS NOT NULL)::BIGINT AS wiki_observed_days
FROM series s
CROSS JOIN anchor a
CROSS JOIN score_weights w
LEFT JOIN series_daily_telemetry t
  ON t.series_id = s.id
  AND t.recorded_date > a.max_date - INTERVAL '7 days'
  AND t.recorded_date <= a.max_date
WHERE w.id = 1
GROUP BY s.id, w.wiki_weight, w.comment_weight, w.upvote_weight;

-- 5. series_deck_candidates
-- squawk-ignore ban-replace-view-function
CREATE OR REPLACE VIEW series_deck_candidates
WITH (security_invoker = on) AS
WITH anchor AS (
  SELECT COALESCE(
    MAX(recorded_date) FILTER (WHERE recorded_date <= (now() AT TIME ZONE 'UTC')::date),
    (now() AT TIME ZONE 'UTC')::date
  ) AS max_date
  FROM series_daily_telemetry
)
SELECT
  l.id,
  l.current_7d_score,
  COUNT(t.recorded_date) FILTER (
    WHERE t.recorded_date > a.max_date - INTERVAL '7 days'
      AND t.recorded_date <= a.max_date
  )::BIGINT AS telemetry_days
FROM series_leaderboard l
CROSS JOIN anchor a
LEFT JOIN series_daily_telemetry t ON t.series_id = l.id
GROUP BY l.id, l.current_7d_score, a.max_date
HAVING l.current_7d_score > 0
   AND COUNT(t.recorded_date) FILTER (
     WHERE t.recorded_date > a.max_date - INTERVAL '7 days'
       AND t.recorded_date <= a.max_date
   ) >= 7;

-- 6. Guard grade_mover_predictions_after_sync() against future dates
-- squawk-ignore ban-replace-view-function
CREATE OR REPLACE FUNCTION grade_mover_predictions_after_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_date DATE;
BEGIN
  IF NEW.status NOT IN ('success', 'partial') THEN
    RETURN NEW;
  END IF;
  SELECT MAX(recorded_date) FILTER (WHERE recorded_date <= (now() AT TIME ZONE 'UTC')::date)
  INTO v_max_date
  FROM series_daily_telemetry;
  IF v_max_date IS NULL THEN RETURN NEW; END IF;

  WITH pending_weeks AS (
    SELECT DISTINCT p.week_start
    FROM mover_predictions p
    WHERE p.graded_at IS NULL AND p.week_start + 6 <= v_max_date
  ), ranked AS (
    SELECT m.period_start AS week_start, m.series_id, m.mover_rank AS actual_rank
    FROM series_weekly_movers m
    JOIN pending_weeks w ON w.week_start = m.period_start
  ), graded AS (
    SELECT p.week_start, p.user_id, r.actual_rank,
      CASE WHEN r.actual_rank = 1 THEN 3
           WHEN r.actual_rank <= 3 THEN 1
           ELSE 0 END::BIGINT AS points
    FROM mover_predictions p
    LEFT JOIN ranked r ON r.week_start = p.week_start AND r.series_id = p.series_id
    WHERE p.graded_at IS NULL
      AND p.week_start + 6 <= v_max_date
      AND EXISTS (SELECT 1 FROM ranked any_rank WHERE any_rank.week_start = p.week_start)
  )
  UPDATE mover_predictions p
  SET points = g.points, actual_rank = g.actual_rank, graded_at = now()
  FROM graded g
  WHERE p.week_start = g.week_start AND p.user_id = g.user_id;
  RETURN NEW;
END;
$$;

COMMIT;
