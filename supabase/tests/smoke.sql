-- TV Arena Database Smoke & Security Verification Suite
-- Executed in CI against a real PostgreSQL instance to verify view integrity,
-- RPC business logic, and RLS / column-level security privileges.

\set ON_ERROR_STOP 1

BEGIN;

-- 1. View Schema & Column Integrity
DO $$
DECLARE
  v_count INT;
  v_buzz BIGINT;
  v_curr BIGINT;
  v_rank BIGINT;
BEGIN
  RAISE NOTICE 'Testing View Schema & Column Integrity...';

  -- Seed baseline series if empty to test view projections
  INSERT INTO series (id, tmdb_id, slug, title, network, genre_group, release_years, chart_color, wiki_slug, reddit_query, buzz_score)
  VALUES 
    (gen_random_uuid(), 66732, 'stranger-things', 'Stranger Things', 'Netflix', 'Drama & Sci-Fi', '2024–2025', '#C66A3D', 'Stranger_Things', 'test', 0),
    (gen_random_uuid(), 1399, 'game-of-thrones', 'Game of Thrones', 'HBO', 'Drama & Sci-Fi', '2024–2025', '#5C828C', 'Game_of_Thrones', 'test', 0),
    (gen_random_uuid(), 114472, 'severance', 'Severance', 'Apple TV+', 'Drama & Sci-Fi', '2024–2025', '#4A7C59', 'Severance', 'test', 0)
  ON CONFLICT (slug) DO NOTHING;

  SELECT COUNT(*) INTO v_count FROM series_leaderboard;
  IF v_count < 1 THEN
    RAISE EXCEPTION 'series_leaderboard returned 0 rows';
  END IF;

  SELECT buzz_score, current_7d_score, rank INTO v_buzz, v_curr, v_rank
  FROM series_leaderboard LIMIT 1;

  IF v_buzz IS NULL OR v_curr IS NULL OR v_rank IS NULL THEN
    RAISE EXCEPTION 'Expected non-null buzz_score, current_7d_score, rank';
  END IF;

  IF v_buzz <> v_curr THEN
    RAISE EXCEPTION 'Expected buzz_score to alias current_7d_score';
  END IF;

  -- Test series_daily_scores view
  SELECT COUNT(*) INTO v_count FROM series_daily_scores;

  -- Test series_recent_telemetry array aggregation view
  SELECT COUNT(*) INTO v_count FROM series_recent_telemetry;
  IF v_count < 1 THEN
    RAISE EXCEPTION 'series_recent_telemetry returned 0 rows';
  END IF;

  RAISE NOTICE '✓ Views exist and return expected columns.';
END $$;

-- 2. Telemetry Delta Calculation & Date Anchoring
DO $$
DECLARE
  v_test_show_id UUID;
  v_anchor_date DATE := CURRENT_DATE;
  v_delta NUMERIC;
  v_daily_score BIGINT;
BEGIN
  RAISE NOTICE 'Testing delta_pct anchor & nullability...';

  -- Create an isolated show for testing delta logic
  INSERT INTO series (id, tmdb_id, slug, title, network, genre_group, release_years, chart_color, wiki_slug, reddit_query, buzz_score)
  VALUES (gen_random_uuid(), 999991, 'test-new-show', 'Test New Show', 'TestNet', 'Drama', '2026', '#111', 'Test_New', 'test', 0)
  RETURNING id INTO v_test_show_id;

  -- Case A: Show with no previous week telemetry must return delta_pct IS NULL
  INSERT INTO series_daily_telemetry (series_id, recorded_date, daily_score, wiki_views, reddit_comments, reddit_upvotes)
  VALUES (v_test_show_id, v_anchor_date, 2625, 100, 10, 5);

  SELECT delta_pct INTO v_delta FROM series_leaderboard WHERE id = v_test_show_id;
  IF v_delta IS NOT NULL THEN
    RAISE EXCEPTION 'Expected delta_pct to be NULL for new show with no previous week, got %', v_delta;
  END IF;

  -- Case B: Show with equal 7-day current and previous volume must return exactly 0.00
  -- Insert equal volume in previous window: anchor_date - 8 days
  INSERT INTO series_daily_telemetry (series_id, recorded_date, daily_score, wiki_views, reddit_comments, reddit_upvotes)
  VALUES (v_test_show_id, v_anchor_date - INTERVAL '8 days', 2625, 100, 10, 5);

  SELECT delta_pct INTO v_delta FROM series_leaderboard WHERE id = v_test_show_id;
  IF v_delta <> 0.00 THEN
    RAISE EXCEPTION 'Expected delta_pct to be 0.00 for flat show, got %', v_delta;
  END IF;

  INSERT INTO series_daily_telemetry (series_id, recorded_date, daily_score, wiki_views, reddit_comments, reddit_upvotes)
  SELECT v_test_show_id, v_anchor_date - day_offset, 0, 100, 0, 0
  FROM generate_series(1, 7) AS days(day_offset)
  ON CONFLICT (series_id, recorded_date) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM series_deck_candidates c
    JOIN series_leaderboard l ON l.id = c.id
    WHERE c.id = v_test_show_id
      AND c.telemetry_days = 7
      AND c.current_7d_score = l.current_7d_score
      AND c.current_7d_score > 0
  ) THEN
    RAISE EXCEPTION 'Expected eligible candidate to use leaderboard score with seven days of history';
  END IF;

  -- A NULL Reddit observation is unavailable data, and still scores wiki only.
  INSERT INTO series_daily_telemetry (series_id, recorded_date, daily_score, wiki_views, reddit_comments, reddit_upvotes, reddit_observed)
  VALUES (v_test_show_id, v_anchor_date - INTERVAL '9 days', 0, 1000, NULL, NULL, FALSE);
  SELECT daily_score INTO v_daily_score FROM series_daily_scores
  WHERE series_id = v_test_show_id AND recorded_date = v_anchor_date - INTERVAL '9 days';
  IF v_daily_score <> 10000 THEN
    RAISE EXCEPTION 'Expected NULL Reddit to retain wiki-only score 10000, got %', v_daily_score;
  END IF;

  RAISE NOTICE '✓ delta_pct logic verified (NULL for new shows, 0.00 for steady).';
END $$;

-- 2b. Historical weekly mover rankings shared with prediction grading
DO $$
DECLARE
  v_series_id UUID := gen_random_uuid();
  v_week_start DATE := DATE '1900-01-01';
  v_delta NUMERIC;
  v_rank BIGINT;
BEGIN
  RAISE NOTICE 'Testing historical weekly mover view...';
  INSERT INTO series (id, tmdb_id, slug, title, network, genre_group, release_years, chart_color, wiki_slug, reddit_query, buzz_score)
  VALUES (v_series_id, 999959, 'test-weekly-mover-view', 'Test Weekly Mover View', 'TestNet', 'Drama', '1900', '#111', 'Mover_View_Test', 'test', 0);
  INSERT INTO series_daily_telemetry (series_id, recorded_date, daily_score, wiki_views, reddit_comments, reddit_upvotes)
  SELECT v_series_id, v_week_start + day_offset - 7, 0,
         CASE WHEN day_offset < 7 THEN 10 ELSE 30 END, 0, 0
  FROM generate_series(0, 13) AS days(day_offset);

  SELECT delta_pct, mover_rank INTO v_delta, v_rank
  FROM series_weekly_movers
  WHERE period_start = v_week_start AND series_id = v_series_id;
  IF v_delta <> 200.00 OR v_rank <> 1 THEN
    RAISE EXCEPTION 'Expected weekly mover view to return +200%% at rank 1, got % at rank %', v_delta, v_rank;
  END IF;
  RAISE NOTICE '✓ Weekly mover view returns historical delta and stable rank.';
END $$;

-- 3. Profile Column-Level Security Privileges
DO $$
DECLARE
  v_user_id UUID := '11111111-1111-1111-1111-111111111111'::UUID;
  v_caught BOOLEAN := FALSE;
BEGIN
  RAISE NOTICE 'Testing Profile Column Privileges...';

  -- Seed auth user so profiles foreign key succeeds
  INSERT INTO auth.users (id, email)
  VALUES (v_user_id, 'test_pilot@example.com')
  ON CONFLICT (id) DO NOTHING;

  -- Seed test profile
  INSERT INTO profiles (id, username, display_name, current_streak, best_streak)
  VALUES (v_user_id, 'test_pilot', 'Test Pilot', 1, 1)
  ON CONFLICT (id) DO NOTHING;

  -- Set auth context to match user
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);

  -- Switch to authenticated role
  SET LOCAL ROLE authenticated;

  -- Attempt to forge best_streak -> MUST fail with permission denied (error 42501)
  BEGIN
    EXECUTE 'UPDATE profiles SET best_streak = 9999 WHERE id = $1' USING v_user_id;
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught := TRUE;
  END;

  IF NOT v_caught THEN
    RESET ROLE;
    RAISE EXCEPTION 'Security failure: authenticated role was able to modify best_streak!';
  END IF;

  -- Legitimate update to username must succeed
  UPDATE profiles SET username = 'updated_pilot' WHERE id = v_user_id;

  RESET ROLE;

  RAISE NOTICE '✓ Profiles security verified (best_streak protected, username editable).';
END $$;

-- 4. Direct user_scores Table Protection
DO $$
DECLARE
  v_user_id UUID := '11111111-1111-1111-1111-111111111111'::UUID;
  v_caught BOOLEAN := FALSE;
BEGIN
  RAISE NOTICE 'Testing user_scores direct insert protection...';

  IF NOT has_table_privilege('authenticated', 'user_scores', 'INSERT') THEN
    RAISE EXCEPTION 'CI role setup is invalid: authenticated lacks INSERT privilege on user_scores; RLS test would be meaningless.';
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);

  BEGIN
    INSERT INTO user_scores (user_id, date, score, answers, completed_at)
    VALUES (v_user_id, CURRENT_DATE, 10, '["higher"]'::jsonb, now());
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught := TRUE;
  END;

  RESET ROLE;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'Security failure: authenticated role was able to directly INSERT into user_scores!';
  END IF;

  RAISE NOTICE '✓ user_scores direct insert protection verified.';
END $$;

-- 6. Weekly mover prediction access, eligibility, and server-side grading
DO $$
DECLARE
  v_user_id UUID := '11111111-1111-1111-1111-111111111111'::UUID;
  v_next_week DATE := date_trunc('week', (now() AT TIME ZONE 'UTC'))::DATE + 7;
  v_prediction_show UUID := gen_random_uuid();
  v_week DATE := DATE '1900-01-01'; -- Monday; isolates ranking from other fixture data.
  v_grade_series UUID[] := ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_grade_users UUID[] := ARRAY[
    '11111111-1111-1111-1111-111111111111'::UUID,
    '22222222-2222-2222-2222-222222222222'::UUID,
    '33333333-3333-3333-3333-333333333333'::UUID
  ];
  v_points SMALLINT[];
  v_visible_count BIGINT;
  v_caught BOOLEAN := FALSE;
  v_sync_id BIGINT;
BEGIN
  RAISE NOTICE 'Testing weekly mover prediction security and grading...';

  INSERT INTO auth.users (id, email) VALUES
    (v_grade_users[1], 'mover_top_test@example.com'),
    (v_grade_users[2], 'mover_top3_test@example.com'),
    (v_grade_users[3], 'mover_outside_test@example.com')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO series (id, tmdb_id, slug, title, network, genre_group, release_years, chart_color, wiki_slug, reddit_query, buzz_score)
  VALUES (v_prediction_show, 999960, 'mover-prediction-eligibility-test', 'Mover Prediction Eligibility Test', 'TestNet', 'Drama', '2026', '#111', 'Mover_Test', 'test', 0);
  INSERT INTO series_daily_telemetry (series_id, recorded_date, daily_score, wiki_views, reddit_comments, reddit_upvotes)
  SELECT v_prediction_show, v_next_week - day_offset, 0, 100, 0, 0
  FROM generate_series(1, 7) AS days(day_offset);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  BEGIN
    INSERT INTO mover_predictions (week_start, user_id, series_id)
    VALUES (v_next_week, v_user_id, v_prediction_show);
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught := TRUE;
  END;
  IF NOT v_caught THEN
    RESET ROLE;
    RAISE EXCEPTION 'Authenticated user was able to insert mover predictions directly';
  END IF;
  PERFORM submit_mover_prediction(v_next_week, v_prediction_show);
  IF NOT EXISTS (
    SELECT 1 FROM mover_predictions
    WHERE week_start = v_next_week AND user_id = v_user_id AND series_id = v_prediction_show
  ) THEN
    RESET ROLE;
    RAISE EXCEPTION 'Prediction RPC did not store the authenticated user''s eligible pick';
  END IF;
  RESET ROLE;

  INSERT INTO series (id, tmdb_id, slug, title, network, genre_group, release_years, chart_color, wiki_slug, reddit_query, buzz_score)
  SELECT s_id, 999970 + n, 'mover-grade-test-' || n, 'Mover Grade Test ' || n, 'TestNet', 'Drama', '1900', '#111', 'Mover_Grade_Test', 'test', 0
  FROM unnest(v_grade_series) WITH ORDINALITY AS s(s_id, n);
  INSERT INTO series_daily_telemetry (series_id, recorded_date, daily_score, wiki_views, reddit_comments, reddit_upvotes)
  SELECT v_grade_series[n], v_week + day_offset - 7, 0,
         CASE WHEN day_offset < 7 THEN 10 ELSE (ARRAY[40, 30, 20, 15])[n] END,
         0, 0
  FROM generate_series(1, 4) AS shows(n)
  CROSS JOIN generate_series(0, 13) AS days(day_offset);

  INSERT INTO mover_predictions (week_start, user_id, series_id)
  SELECT v_week, user_id, series_id
  FROM unnest(v_grade_users, ARRAY[v_grade_series[1], v_grade_series[2], v_grade_series[4]]) AS picks(user_id, series_id);

  INSERT INTO sync_runs (status) VALUES ('running') RETURNING id INTO v_sync_id;
  UPDATE sync_runs SET status = 'success', completed_at = now() WHERE id = v_sync_id;

  SELECT array_agg(points ORDER BY user_id) INTO v_points
  FROM mover_predictions WHERE week_start = v_week;
  IF v_points IS DISTINCT FROM ARRAY[3::SMALLINT, 1::SMALLINT, 0::SMALLINT] THEN
    RAISE EXCEPTION 'Expected mover prediction points [3, 1, 0], got %', v_points;
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_grade_users[1]::text, true);
  SELECT COUNT(*) INTO v_visible_count FROM mover_predictions WHERE week_start = v_week;
  RESET ROLE;
  IF v_visible_count <> 1 THEN
    RAISE EXCEPTION 'RLS exposed % mover predictions instead of the authenticated user''s own row', v_visible_count;
  END IF;

  RAISE NOTICE '✓ Mover predictions are RPC-only and grade to 3, 1, and 0 points.';
END $$;

-- 5. RPC submit_daily_score Logic & Edge Cases
DO $$
DECLARE
  v_user_id UUID := '11111111-1111-1111-1111-111111111111'::UUID;
  v_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::DATE;
  v_show_a UUID;
  v_show_b UUID;
  v_show_c UUID;
  v_deck UUID[];
  v_res JSONB;
  v_caught BOOLEAN;
  v_rpc_definition TEXT;
BEGIN
  RAISE NOTICE 'Testing submit_daily_score RPC...';

  SELECT pg_get_functiondef('public.submit_daily_score(date,jsonb)'::regprocedure)
  INTO v_rpc_definition;
  IF position('s.buzz_score' IN v_rpc_definition) > 0
     OR position('FROM series s' IN v_rpc_definition) > 0 THEN
    RAISE EXCEPTION 'submit_daily_score reads a stored series score instead of the leaderboard view';
  END IF;

  SELECT id INTO v_show_a FROM series ORDER BY id LIMIT 1 OFFSET 0;
  SELECT id INTO v_show_b FROM series ORDER BY id LIMIT 1 OFFSET 1;
  SELECT id INTO v_show_c FROM series ORDER BY id LIMIT 1 OFFSET 2;
  v_deck := ARRAY[v_show_a, v_show_b, v_show_c];

  -- Seed challenge deck for today
  INSERT INTO daily_challenges (date, series_ids)
  VALUES (v_today, v_deck)
  ON CONFLICT (date) DO UPDATE SET series_ids = v_deck;

  -- 5a. Unauthenticated submission must fail (no sub claim)
  PERFORM set_config('request.jwt.claim.sub', '', true);
  v_caught := FALSE;
  BEGIN
    PERFORM submit_daily_score(v_today, '["higher", "lower"]'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_caught := TRUE;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'submit_daily_score allowed unauthenticated execution';
  END IF;

  -- Set auth user context
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);

  -- 5b. Malformed payload (wrong length) must fail
  v_caught := FALSE;
  BEGIN
    PERFORM submit_daily_score(v_today, '["higher"]'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_caught := TRUE;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'submit_daily_score allowed malformed payload with wrong length';
  END IF;

  -- 5c. Valid submission must succeed
  v_res := submit_daily_score(v_today, '["higher", "lower"]'::jsonb);
  IF (v_res->>'success')::BOOLEAN <> TRUE THEN
    RAISE EXCEPTION 'submit_daily_score did not return success: true';
  END IF;

  -- 5d. Duplicate submission for same date must fail
  v_caught := FALSE;
  BEGIN
    PERFORM submit_daily_score(v_today, '["higher", "lower"]'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_caught := TRUE;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'submit_daily_score allowed duplicate score submission';
  END IF;

  RAISE NOTICE '✓ submit_daily_score RPC validation & scoring verified.';
END $$;

ROLLBACK;

\echo '===================================='
\echo 'All Supabase Smoke Tests Passed! 🎉'
\echo '===================================='
