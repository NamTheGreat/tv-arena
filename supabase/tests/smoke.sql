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
  v_wiki_contribution NUMERIC;
  v_reddit_contribution NUMERIC;
  v_reddit_days BIGINT;
  v_network_group TEXT;
BEGIN
  RAISE NOTICE 'Testing View Schema & Column Integrity...';

  -- Seed baseline series if empty to test view projections
  INSERT INTO series (id, tmdb_id, slug, title, network, network_group, genre_group, release_years, chart_color, wiki_slug, reddit_query, buzz_score)
  VALUES 
    (gen_random_uuid(), 66732, 'stranger-things', 'Stranger Things', 'Netflix', 'Netflix', 'Drama & Sci-Fi', '2024–2025', '#C66A3D', 'Stranger_Things', 'test', 0),
    (gen_random_uuid(), 1399, 'game-of-thrones', 'Game of Thrones', 'HBO', 'HBO', 'Drama & Sci-Fi', '2024–2025', '#5C828C', 'Game_of_Thrones', 'test', 0),
    (gen_random_uuid(), 114472, 'severance', 'Severance', 'Apple TV+', 'Apple TV+', 'Drama & Sci-Fi', '2024–2025', '#4A7C59', 'Severance', 'test', 0)
  ON CONFLICT (slug) DO NOTHING;

  INSERT INTO series_daily_telemetry (series_id, recorded_date, daily_score, wiki_views, reddit_comments, reddit_upvotes, reddit_observed)
  SELECT id, CURRENT_DATE, 0, 1, 2, 3, TRUE
  FROM series WHERE slug = 'stranger-things'
  ON CONFLICT (series_id, recorded_date) DO NOTHING;

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

  SELECT network_group INTO v_network_group FROM series_leaderboard WHERE slug = 'stranger-things';
  IF v_network_group IS DISTINCT FROM 'Netflix' THEN
    RAISE EXCEPTION 'Expected normalized network group Netflix, got %', v_network_group;
  END IF;

  -- Test series_daily_scores view
  SELECT COUNT(*) INTO v_count FROM series_daily_scores;

  SELECT COUNT(*) INTO v_count
  FROM series_signal_contributions
  WHERE series_id = (SELECT id FROM series WHERE slug = 'stranger-things');
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected signal contribution row for Stranger Things';
  END IF;
  SELECT wiki_contribution, reddit_contribution, reddit_observed_days
  INTO v_wiki_contribution, v_reddit_contribution, v_reddit_days
  FROM series_signal_contributions
  WHERE series_id = (SELECT id FROM series WHERE slug = 'stranger-things');
  IF v_wiki_contribution <> 10 OR v_reddit_contribution <> 375 OR v_reddit_days <> 1 THEN
    RAISE EXCEPTION 'Unexpected signal contributions: wiki %, reddit %, observed days %',
      v_wiki_contribution, v_reddit_contribution, v_reddit_days;
  END IF;

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
  v_blocked BOOLEAN := FALSE;
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

  BEGIN
    UPDATE profiles SET username = 'admin' WHERE id = v_user_id;
  EXCEPTION WHEN check_violation THEN
    v_blocked := TRUE;
  END;

  IF NOT v_blocked THEN
    RESET ROLE;
    RAISE EXCEPTION 'Security failure: reserved username was accepted';
  END IF;

  RESET ROLE;

  RAISE NOTICE '✓ Profiles security verified (best_streak protected, username editable).';
END $$;

-- 4. Watchlist ownership and write protection
DO $$
DECLARE
  v_user_id UUID := '11111111-1111-1111-1111-111111111111'::UUID;
  v_other_user_id UUID := '22222222-2222-2222-2222-222222222222'::UUID;
  v_series_id UUID;
  v_count BIGINT;
  v_rows BIGINT;
  v_caught BOOLEAN := FALSE;
BEGIN
  RAISE NOTICE 'Testing user_watchlist ownership...';

  INSERT INTO auth.users (id, email)
  VALUES (v_user_id, 'watchlist_owner@example.com'),
         (v_other_user_id, 'watchlist_other@example.com')
  ON CONFLICT (id) DO NOTHING;

  SELECT id INTO v_series_id FROM series WHERE slug = 'stranger-things';
  IF v_series_id IS NULL THEN
    RAISE EXCEPTION 'Watchlist smoke test could not find the seeded series';
  END IF;

  IF NOT has_table_privilege('authenticated', 'user_watchlist', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'user_watchlist', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'user_watchlist', 'DELETE')
     OR has_table_privilege('authenticated', 'user_watchlist', 'UPDATE') THEN
    RAISE EXCEPTION 'Watchlist grants do not match the intended select/insert/delete contract';
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  INSERT INTO user_watchlist (user_id, series_id) VALUES (v_user_id, v_series_id);

  SELECT COUNT(*) INTO v_count FROM user_watchlist WHERE series_id = v_series_id;
  IF v_count <> 1 THEN
    RESET ROLE;
    RAISE EXCEPTION 'Watchlist owner could not read their own saved show';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_other_user_id::text, true);
  SELECT COUNT(*) INTO v_count FROM user_watchlist WHERE series_id = v_series_id;
  IF v_count <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'A different user could read another user''s saved show';
  END IF;

  DELETE FROM user_watchlist WHERE user_id = v_user_id AND series_id = v_series_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'A different user could delete another user''s saved show';
  END IF;

  BEGIN
    INSERT INTO user_watchlist (user_id, series_id) VALUES (v_user_id, v_series_id);
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught := TRUE;
  END;
  RESET ROLE;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'A user was able to insert a watchlist row for another user';
  END IF;

  SELECT COUNT(*) INTO v_count FROM user_watchlist
  WHERE user_id = v_user_id AND series_id = v_series_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Unauthorized delete changed the owner''s watchlist';
  END IF;

  RAISE NOTICE '✓ Watchlist ownership and write protection verified.';
END $$;

-- 5. Direct user_scores Table Protection
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
  v_zero_prior_show UUID := gen_random_uuid();
  v_week DATE := DATE '1900-01-01'; -- Monday; isolates ranking from other fixture data.
  v_grade_series UUID[] := ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_grade_users UUID[] := ARRAY[
    '11111111-1111-1111-1111-111111111111'::UUID,
    '22222222-2222-2222-2222-222222222222'::UUID,
    '33333333-3333-3333-3333-333333333333'::UUID
  ];
  v_points BIGINT[];
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
  VALUES (v_zero_prior_show, 999961, 'mover-prediction-zero-prior-test', 'Mover Prediction Zero Prior Test', 'TestNet', 'Drama', '2026', '#111', 'Mover_Zero_Prior_Test', 'test', 0);
  INSERT INTO series_daily_telemetry (series_id, recorded_date, daily_score, wiki_views, reddit_comments, reddit_upvotes)
  SELECT v_zero_prior_show, v_next_week - 7 - day_offset, 0, 100, 0, 0
  FROM generate_series(1, 7) AS days(day_offset);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  BEGIN
    PERFORM submit_mover_prediction(v_next_week, v_zero_prior_show);
  EXCEPTION WHEN raise_exception THEN
    v_caught := TRUE;
  END;
  RESET ROLE;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'Prediction RPC accepted a show with no positive prior-week score';
  END IF;

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
  IF v_points IS DISTINCT FROM ARRAY[3::BIGINT, 1::BIGINT, 0::BIGINT] THEN
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
CREATE TEMP TABLE daily_grading_contract_fixture (
  position INT PRIMARY KEY,
  wiki_views INT NOT NULL,
  reddit_comments INT NOT NULL,
  reddit_upvotes INT NOT NULL,
  answer TEXT,
  series_id UUID NOT NULL DEFAULT gen_random_uuid()
);
\copy daily_grading_contract_fixture (position, wiki_views, reddit_comments, reddit_upvotes, answer) FROM 'supabase/tests/fixtures/daily-grading.csv' WITH (FORMAT csv, HEADER)

INSERT INTO series (id, tmdb_id, slug, title, network, genre_group, release_years, chart_color, wiki_slug, reddit_query, buzz_score)
SELECT series_id, 980000 + position, 'daily-contract-' || position, 'Daily Contract ' || position,
       'Contract', 'Drama', '2026', '#111111', 'Daily_Contract_' || position, 'contract', 0
FROM daily_grading_contract_fixture;

INSERT INTO series_daily_telemetry (series_id, recorded_date, daily_score, wiki_views, reddit_comments, reddit_upvotes)
SELECT series_id, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::DATE, 0, wiki_views, reddit_comments, reddit_upvotes
FROM daily_grading_contract_fixture;

DO $$
DECLARE
  v_user_id UUID := '11111111-1111-1111-1111-111111111111'::UUID;
  v_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::DATE;
  v_deck UUID[];
  v_answers JSONB;
  v_res JSONB;
  v_share JSONB;
  v_public_share JSONB;
  v_correctness BOOLEAN[];
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

  SELECT array_agg(series_id ORDER BY position) INTO v_deck
  FROM daily_grading_contract_fixture;
  SELECT to_jsonb(array_agg(answer ORDER BY position) FILTER (WHERE position > 1))
  INTO v_answers FROM daily_grading_contract_fixture;

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

  v_caught := FALSE;
  BEGIN
    PERFORM submit_daily_score(v_today, '["higher", "unknown"]'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_caught := TRUE;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'submit_daily_score allowed an unknown answer value';
  END IF;

  -- 5c. Valid submission must succeed
  v_res := submit_daily_score(v_today, v_answers);
  IF (v_res->>'success')::BOOLEAN <> TRUE THEN
    RAISE EXCEPTION 'submit_daily_score did not return success: true';
  END IF;
  IF (v_res->>'score')::INT <> 2 THEN
    RAISE EXCEPTION 'submit_daily_score disagrees with the strict-comparison contract fixture: %', v_res->>'score';
  END IF;

  SELECT correctness INTO v_correctness FROM user_scores WHERE user_id = v_user_id AND date = v_today;
  IF v_correctness IS NULL
     OR array_length(v_correctness, 1) <> jsonb_array_length(v_answers)
     OR (SELECT count(*) FROM unnest(v_correctness) AS item(correct) WHERE correct) <> (v_res->>'score')::INT THEN
    RAISE EXCEPTION 'submit_daily_score did not persist its server-calculated correctness grid';
  END IF;
  INSERT INTO user_scores (user_id, date, score, answers, correctness, completed_at)
  VALUES (
    v_user_id, v_today - 1, 7,
    '["higher","higher","lower","higher","higher","higher","lower","higher","lower","higher"]'::jsonb,
    ARRAY[TRUE, TRUE, FALSE, TRUE, TRUE, TRUE, FALSE, TRUE, FALSE, TRUE], now()
  );
  v_share := create_daily_score_share(v_today - 1);
  v_public_share := get_daily_score_share((v_share->>'token')::UUID);
  IF v_share->>'token' IS NULL
     OR v_public_share IS NULL
     OR v_share->>'score' <> '7'
     OR v_public_share->>'score' <> '7'
     OR v_public_share->'correctness' <> to_jsonb(ARRAY[TRUE, TRUE, FALSE, TRUE, TRUE, TRUE, FALSE, TRUE, FALSE, TRUE]) THEN
    RAISE EXCEPTION 'Daily share resolver did not return the server-verified score row';
  END IF;

  -- 5d. Duplicate submission for same date must fail
  v_caught := FALSE;
  BEGIN
    PERFORM submit_daily_score(v_today, v_answers);
  EXCEPTION WHEN OTHERS THEN
    v_caught := TRUE;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'submit_daily_score allowed duplicate score submission';
  END IF;

  RAISE NOTICE '✓ submit_daily_score RPC validation & scoring verified.';
END $$;

-- 6. Legacy Telemetry Column Resilience
DO $$
BEGIN
  RAISE NOTICE 'Testing legacy telemetry column resilience...';

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'series_daily_telemetry' AND column_name = 'daily_viewers'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'series_daily_telemetry' AND column_name = 'daily_viewers' AND is_nullable = 'NO'
    ) THEN
      RAISE EXCEPTION 'Expected legacy daily_viewers column to be nullable';
    END IF;
  END IF;

  RAISE NOTICE '✓ Legacy telemetry column resilience verified.';
END $$;

ROLLBACK;

\echo '===================================='
\echo 'All Supabase Smoke Tests Passed! 🎉'
\echo '===================================='
