-- Migration: Fix submit_daily_score column reference, validate answers, secure profiles, and harden views

-- 1. Secure profiles table: prevent users from forging streak / score columns
GRANT SELECT ON profiles TO anon, authenticated;
REVOKE UPDATE ON profiles FROM authenticated;
GRANT UPDATE (username, display_name) ON profiles TO authenticated;

DROP POLICY IF EXISTS "Allow users update own profile" ON profiles;
CREATE POLICY "Allow users update own profile" ON profiles 
  FOR UPDATE 
  USING (auth.uid() = id) 
  WITH CHECK (auth.uid() = id);

-- 1b. Ensure series_daily_telemetry.daily_score defaults to 0
ALTER TABLE series_daily_telemetry ALTER COLUMN daily_score SET DEFAULT 0;

-- 2. Harden views with security_invoker = on, anchor to max telemetry date, and deterministic tie-breaker
CREATE OR REPLACE VIEW series_daily_scores 
WITH (security_invoker = on) AS
SELECT
  t.id AS telemetry_id,
  t.series_id,
  t.recorded_date,
  t.wiki_views,
  t.reddit_comments,
  COALESCE(t.reddit_upvotes, 0) AS reddit_upvotes,
  ROUND(
    (t.wiki_views * w.wiki_weight) +
    (t.reddit_comments * w.comment_weight) +
    (COALESCE(t.reddit_upvotes, 0) * w.upvote_weight)
  )::BIGINT AS daily_score
FROM series_daily_telemetry t
CROSS JOIN (SELECT wiki_weight, comment_weight, upvote_weight FROM score_weights WHERE id = 1 LIMIT 1) w;

GRANT SELECT ON series_daily_scores TO anon, authenticated;

DROP VIEW IF EXISTS series_leaderboard CASCADE;

CREATE VIEW series_leaderboard 
WITH (security_invoker = on) AS
WITH anchor AS (
  SELECT COALESCE(MAX(recorded_date), CURRENT_DATE) AS max_date
  FROM series_daily_telemetry
),
daily_buckets AS (
  SELECT
    s.id AS series_id,
    s.tmdb_id,
    s.slug,
    s.title,
    s.network,
    s.genre_group,
    s.release_years,
    s.chart_color,
    COALESCE(SUM(CASE WHEN d.recorded_date > a.max_date - INTERVAL '7 days' AND d.recorded_date <= a.max_date THEN d.daily_score ELSE 0 END), 0)::BIGINT AS current_7d_score,
    COALESCE(SUM(CASE WHEN d.recorded_date > a.max_date - INTERVAL '14 days' AND d.recorded_date <= a.max_date - INTERVAL '7 days' THEN d.daily_score ELSE 0 END), 0)::BIGINT AS previous_7d_score
  FROM series s
  CROSS JOIN anchor a
  LEFT JOIN series_daily_scores d ON s.id = d.series_id
  GROUP BY s.id, s.tmdb_id, s.slug, s.title, s.network, s.genre_group, s.release_years, s.chart_color, a.max_date
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
  current_7d_score,
  current_7d_score AS buzz_score,
  previous_7d_score,
  CASE
    WHEN previous_7d_score > 0 THEN
      ROUND(((current_7d_score - previous_7d_score)::NUMERIC / previous_7d_score::NUMERIC) * 100, 2)
    ELSE NULL
  END AS delta_pct,
  ROW_NUMBER() OVER (ORDER BY current_7d_score DESC, title ASC) as rank
FROM daily_buckets;

GRANT SELECT ON series_leaderboard TO anon, authenticated;

-- 2b. Aggregate recent 90-day telemetry as arrays to guarantee 1 row per show (bypasses 1,000-row PostgREST limits)
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
    d.daily_score
  FROM series_daily_scores d
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
  ) AS daily_dates
FROM series s
LEFT JOIN recent_scores r ON s.id = r.series_id
GROUP BY s.id;

GRANT SELECT ON series_recent_telemetry TO anon, authenticated;

-- 3. Fix submit_daily_score: validate p_answers and query series_leaderboard / buzz_score
CREATE OR REPLACE FUNCTION submit_daily_score(
  p_date DATE,
  p_answers JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_deck UUID[];
  v_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::DATE;
  v_yesterday DATE := v_today - INTERVAL '1 day';
  v_calculated_score INT := 0;
  v_show_a_id UUID;
  v_show_b_id UUID;
  v_score_a BIGINT;
  v_score_b BIGINT;
  v_guess TEXT;
  v_is_higher BOOLEAN;
  v_deck_len INT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required to submit score';
  END IF;

  IF p_date < v_yesterday OR p_date > v_today THEN
    RAISE EXCEPTION 'Score submissions are only accepted for today or yesterday UTC';
  END IF;

  SELECT series_ids INTO v_deck FROM daily_challenges WHERE date = p_date;
  IF v_deck IS NULL THEN
    RAISE EXCEPTION 'No challenge deck found for date %', p_date;
  END IF;

  v_deck_len := array_length(v_deck, 1);
  IF v_deck_len < 2 THEN
    RAISE EXCEPTION 'Challenge deck is incomplete';
  END IF;

  -- Validate p_answers structure: must be an array of matching length
  IF jsonb_typeof(p_answers) <> 'array' OR jsonb_array_length(p_answers) <> (v_deck_len - 1) THEN
    RAISE EXCEPTION 'p_answers must be a JSON array of % answers', (v_deck_len - 1);
  END IF;

  -- Check if user already submitted for this date
  IF EXISTS (
    SELECT 1 FROM user_scores 
    WHERE user_id = v_uid AND date = p_date
  ) THEN
    RAISE EXCEPTION 'Score already submitted for this daily challenge';
  END IF;

  -- Score answers against dynamic series_leaderboard with fallback to stored buzz_score
  FOR i IN 0 .. (LEAST(v_deck_len - 2, 9)) LOOP
    v_show_a_id := v_deck[i + 1];
    v_show_b_id := v_deck[i + 2];
    v_guess := p_answers->>i;

    SELECT COALESCE(l.current_7d_score, s.buzz_score, 0) INTO v_score_a 
    FROM series s 
    LEFT JOIN series_leaderboard l ON s.id = l.id 
    WHERE s.id = v_show_a_id;

    SELECT COALESCE(l.current_7d_score, s.buzz_score, 0) INTO v_score_b 
    FROM series s 
    LEFT JOIN series_leaderboard l ON s.id = l.id 
    WHERE s.id = v_show_b_id;

    v_is_higher := v_score_b >= v_score_a;
    IF (v_guess = 'higher' AND v_is_higher) OR (v_guess = 'lower' AND NOT v_is_higher) THEN
      v_calculated_score := v_calculated_score + 1;
    END IF;
  END LOOP;

  INSERT INTO user_scores (user_id, date, score, answers, completed_at)
  VALUES (v_uid, p_date, v_calculated_score, p_answers, now());

  -- Update streak on profile
  UPDATE profiles
  SET current_streak = CASE
        WHEN last_played_date = p_date - INTERVAL '1 day' THEN current_streak + 1
        WHEN last_played_date = p_date THEN current_streak
        ELSE 1
      END,
      best_streak = GREATEST(
        best_streak,
        CASE
          WHEN last_played_date = p_date - INTERVAL '1 day' THEN current_streak + 1
          ELSE 1
        END
      ),
      last_played_date = p_date,
      updated_at = now()
  WHERE id = v_uid;

  RETURN jsonb_build_object(
    'success', true,
    'score', v_calculated_score,
    'date', p_date
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION submit_daily_score(DATE, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION submit_daily_score(DATE, JSONB) TO authenticated;
