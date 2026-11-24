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
  v_last_wiki_date TEXT;
  v_last_reddit_date TEXT;
  v_wiki_days BIGINT;
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
  SELECT wiki_contribution, reddit_contribution, reddit_observed_days, last_wiki_date, last_reddit_date, wiki_observed_days
  INTO v_wiki_contribution, v_reddit_contribution, v_reddit_days, v_last_wiki_date, v_last_reddit_date, v_wiki_days
  FROM series_signal_contributions
  WHERE series_id = (SELECT id FROM series WHERE slug = 'stranger-things');
  IF v_wiki_contribution <> 10 OR v_reddit_contribution <> 375 OR v_reddit_days <> 1 OR v_last_wiki_date IS NULL OR v_last_reddit_date IS NULL OR v_wiki_days <> 1 THEN
    RAISE EXCEPTION 'Unexpected signal contributions: wiki %, reddit %, observed days %, wiki_date %, reddit_date %',
      v_wiki_contribution, v_reddit_contribution, v_reddit_days, v_last_wiki_date, v_last_reddit_date;
  END IF;

  -- Test series_recent_telemetry array aggregation view including daily_ranks
  SELECT COUNT(*) INTO v_count FROM series_recent_telemetry WHERE daily_ranks IS NOT NULL;
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
  SELECT v_prediction_show, (now() AT TIME ZONE 'UTC')::DATE - day_offset, 0, 100, 0, 0
  FROM generate_series(0, 13) AS days(day_offset);

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
  SELECT v_zero_prior_show, (now() AT TIME ZONE 'UTC')::DATE - 7 - day_offset, 0, 0, 0, 0
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
  UPDATE sync_runs SET status = 'partial', completed_at = now() WHERE id = v_sync_id;

  SELECT array_agg(points ORDER BY user_id) INTO v_points
  FROM mover_predictions WHERE week_start = v_week;
  IF v_points IS DISTINCT FROM ARRAY[3::BIGINT, 1::BIGINT, 0::BIGINT] THEN
    RAISE EXCEPTION 'Expected partial sync run to grade mover prediction points [3, 1, 0], got %', v_points;
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_grade_users[1]::text, true);
  SELECT COUNT(*) INTO v_visible_count FROM mover_predictions WHERE week_start = v_week;
  RESET ROLE;
  IF v_visible_count <> 1 THEN
    RAISE EXCEPTION 'RLS exposed % mover predictions instead of the authenticated user''s own row', v_visible_count;
  END IF;

  RAISE NOTICE '✓ Mover predictions are RPC-only and grade on partial or successful sync to 3, 1, and 0 points.';
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

  -- 5e. Frozen series_scores takes precedence over live leaderboard values
  DECLARE
    v_user_frozen UUID := gen_random_uuid();
    v_frozen_scores JSONB;
    v_frozen_res JSONB;
    v_is_correct BOOLEAN;
  BEGIN
    INSERT INTO auth.users (id, email) VALUES (v_user_frozen, 'frozen@test.com');
    INSERT INTO profiles (id, username, display_name)
    VALUES (v_user_frozen, 'frozen_test', 'Frozen Test')
    ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, display_name = EXCLUDED.display_name;
    PERFORM set_config('request.jwt.claim.sub', v_user_frozen::text, true);

    -- Build frozen score snapshot where show 2 has score 999999 and show 1 has score 1.
    v_frozen_scores := jsonb_build_object(
      (v_deck[1])::text, 1,
      (v_deck[2])::text, 999999
    );
    FOR i IN 3 .. array_length(v_deck, 1) LOOP
      v_frozen_scores := v_frozen_scores || jsonb_build_object((v_deck[i])::text, i * 10);
    END LOOP;

    INSERT INTO daily_challenges (date, series_ids, series_scores)
    VALUES (v_today - 1, v_deck, v_frozen_scores)
    ON CONFLICT (date) DO UPDATE SET series_ids = v_deck, series_scores = v_frozen_scores;

    -- User answers 'higher' for first matchup: with frozen scores (999999 > 1), round 1 must be correct
    v_frozen_res := submit_daily_score(v_today - 1, '["higher","higher","higher"]'::jsonb);
    IF (v_frozen_res->>'success')::BOOLEAN <> TRUE THEN
      RAISE EXCEPTION 'submit_daily_score failed with frozen series_scores';
    END IF;

    SELECT correctness[1] INTO v_is_correct FROM user_scores WHERE user_id = v_user_frozen AND date = v_today - 1;
    IF v_is_correct <> TRUE THEN
      RAISE EXCEPTION 'Expected first round to be evaluated as TRUE under frozen series_scores';
    END IF;
  END;

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

-- 7. Defensive Anchor Guard & Future-Date Guard
DO $$
DECLARE
  v_score_before BIGINT;
  v_score_after BIGINT;
  v_candidates_before BIGINT;
  v_candidates_after BIGINT;
  v_future_rejected BOOLEAN := FALSE;
  v_test_series_id UUID;
BEGIN
  RAISE NOTICE 'Testing Defensive Anchor Guard & Future-Date Guard...';

  SELECT id INTO v_test_series_id FROM series LIMIT 1;

  -- Verify trigger blocks future telemetry insertions
  BEGIN
    INSERT INTO series_daily_telemetry (series_id, recorded_date, daily_score)
    VALUES (v_test_series_id, (now() AT TIME ZONE 'UTC')::date + INTERVAL '30 days', 9999);
  EXCEPTION WHEN OTHERS THEN
    v_future_rejected := TRUE;
  END;

  IF NOT v_future_rejected THEN
    RAISE EXCEPTION 'Trigger failed to block future-dated telemetry row';
  END IF;

  -- Verify views ignore future rows if trigger was disabled / bypassed
  ALTER TABLE series_daily_telemetry DISABLE TRIGGER trg_check_telemetry_recorded_date;

  SELECT COALESCE(current_7d_score, 0) INTO v_score_before
  FROM series_leaderboard WHERE id = v_test_series_id;
  SELECT COUNT(*) INTO v_candidates_before FROM series_deck_candidates;

  INSERT INTO series_daily_telemetry (series_id, recorded_date, daily_score)
  VALUES (v_test_series_id, (now() AT TIME ZONE 'UTC')::date + INTERVAL '365 days', 9999)
  ON CONFLICT (series_id, recorded_date) DO NOTHING;

  SELECT COALESCE(current_7d_score, 0) INTO v_score_after
  FROM series_leaderboard WHERE id = v_test_series_id;
  SELECT COUNT(*) INTO v_candidates_after FROM series_deck_candidates;

  IF v_score_before IS DISTINCT FROM v_score_after THEN
    RAISE EXCEPTION 'Leaderboard current_7d_score shifted when future row was present: before %, after %',
      v_score_before, v_score_after;
  END IF;

  IF v_candidates_before IS DISTINCT FROM v_candidates_after THEN
    RAISE EXCEPTION 'Deck candidates count shifted when future row was present: before %, after %',
      v_candidates_before, v_candidates_after;
  END IF;

  -- Clean up test row and re-enable trigger
  DELETE FROM series_daily_telemetry
  WHERE series_id = v_test_series_id
    AND recorded_date > (now() AT TIME ZONE 'UTC')::date;

  ALTER TABLE series_daily_telemetry ENABLE TRIGGER trg_check_telemetry_recorded_date;

  RAISE NOTICE '✓ Future telemetry rejected by trigger and ignored by rolling views.';
END $$;

-- 8. Show comments: RLS, validation, spam brake (#191)
DO $$
DECLARE
  v_series UUID := gen_random_uuid();
  v_u1 UUID := gen_random_uuid();
  v_u2 UUID := gen_random_uuid();
  v_c1 UUID;
  v_n INT;
  v_body TEXT;
  v_ok BOOLEAN;
BEGIN
  RAISE NOTICE 'Testing show comments...';
  INSERT INTO series (id, tmdb_id, slug, title, network, network_group, genre_group, release_years, chart_color, wiki_slug, reddit_query, buzz_score)
  VALUES (v_series, 999951, 'cmt-show', 'Comment Show', 'TestNet', 'TestNet', 'Drama', '2019', '#111111', 'Cmt_Show', 'test', 0);
  INSERT INTO auth.users (id, email) VALUES (v_u1, 'commenter_one@example.com'), (v_u2, 'commenter_two@example.com');
  INSERT INTO profiles (id, username) VALUES (v_u1, 'commenter_one'), (v_u2, 'commenter_two')
  ON CONFLICT (id) DO NOTHING;

  -- anon can read but cannot post
  SET LOCAL ROLE anon;
  PERFORM 1 FROM series_comments;
  v_ok := FALSE;
  BEGIN
    INSERT INTO series_comments (series_id, user_id, body) VALUES (v_series, v_u1, 'anon post');
  EXCEPTION WHEN insufficient_privilege THEN v_ok := TRUE; END;
  RESET ROLE;
  IF NOT v_ok THEN RAISE EXCEPTION 'anon must not be able to post comments'; END IF;

  -- user 1 posts; body is trimmed
  PERFORM set_config('request.jwt.claim.sub', v_u1::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO series_comments (series_id, user_id, body) VALUES (v_series, v_u1, '  Deserves #1  ') RETURNING id INTO v_c1;
  IF (SELECT body FROM series_comments WHERE id = v_c1) <> 'Deserves #1' THEN
    RAISE EXCEPTION 'comment body must be trimmed';
  END IF;

  -- cannot post as someone else
  v_ok := FALSE;
  BEGIN
    INSERT INTO series_comments (series_id, user_id, body) VALUES (v_series, v_u2, 'impersonation');
  EXCEPTION WHEN insufficient_privilege THEN v_ok := TRUE; END;
  IF NOT v_ok THEN RESET ROLE; RAISE EXCEPTION 'users must not post as other users'; END IF;

  -- cannot self-approve / set status or timestamps on insert
  v_ok := FALSE;
  BEGIN
    EXECUTE 'INSERT INTO series_comments (series_id, user_id, body, status) VALUES ($1, $2, ''x'', ''hidden'')' USING v_series, v_u1;
  EXCEPTION WHEN insufficient_privilege THEN v_ok := TRUE; END;
  IF NOT v_ok THEN RESET ROLE; RAISE EXCEPTION 'status must not be writable by users'; END IF;

  -- validation: empty, whitespace-only, 281 chars, markup, script URLs, control chars
  FOREACH v_body IN ARRAY ARRAY['', '   ', repeat('a', 281), '<script>alert(1)</script>', 'hi <img src=x onerror=1>', 'JavaScript:alert(1)', 'bad' || chr(7) || 'char']
  LOOP
    v_ok := FALSE;
    BEGIN
      INSERT INTO series_comments (series_id, user_id, body) VALUES (v_series, v_u1, v_body);
    EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
    IF NOT v_ok THEN RESET ROLE; RAISE EXCEPTION 'invalid comment accepted: %', left(v_body, 30); END IF;
  END LOOP;
  -- boundary and harmless symbols are fine
  INSERT INTO series_comments (series_id, user_id, body) VALUES (v_series, v_u1, repeat('a', 280));
  INSERT INTO series_comments (series_id, user_id, body) VALUES (v_series, v_u1, 'I <3 this show & 2 > 1');

  -- user 2 cannot edit or delete user 1's comment (silently affects 0 rows)
  PERFORM set_config('request.jwt.claim.sub', v_u2::text, true);
  UPDATE series_comments SET body = 'hijacked' WHERE id = v_c1;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RESET ROLE; RAISE EXCEPTION 'user 2 edited user 1 comment'; END IF;
  DELETE FROM series_comments WHERE id = v_c1;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RESET ROLE; RAISE EXCEPTION 'user 2 deleted user 1 comment'; END IF;

  -- author can edit (updated_at moves) but cannot reassign ownership or edit other columns
  PERFORM set_config('request.jwt.claim.sub', v_u1::text, true);
  UPDATE series_comments SET body = 'Edited take' WHERE id = v_c1;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RESET ROLE; RAISE EXCEPTION 'author could not edit own comment'; END IF;
  v_ok := FALSE;
  BEGIN
    EXECUTE 'UPDATE series_comments SET user_id = $1 WHERE id = $2' USING v_u2, v_c1;
  EXCEPTION WHEN insufficient_privilege THEN v_ok := TRUE; END;
  IF NOT v_ok THEN RESET ROLE; RAISE EXCEPTION 'user_id must not be updatable'; END IF;
  v_ok := FALSE;
  BEGIN
    UPDATE series_comments SET body = '<b>x</b>' WHERE id = v_c1;
  EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  IF NOT v_ok THEN RESET ROLE; RAISE EXCEPTION 'edits must pass the same validation'; END IF;

  -- hidden comments disappear from public reads
  RESET ROLE;
  UPDATE series_comments SET status = 'hidden' WHERE id = v_c1;
  SET LOCAL ROLE anon;
  SELECT COUNT(*) INTO v_n FROM series_comments WHERE id = v_c1;
  RESET ROLE;
  IF v_n <> 0 THEN RAISE EXCEPTION 'hidden comments must not be publicly readable'; END IF;

  -- spam brake: user 1 already has 4 rows this minute (c1 + 280 chars + <3 ... plus edits), fill to 5 then 6th fails
  SELECT COUNT(*) INTO v_n FROM series_comments WHERE user_id = v_u1;
  WHILE v_n < 5 LOOP
    INSERT INTO series_comments (series_id, user_id, body) VALUES (v_series, v_u1, 'filler ' || v_n);
    v_n := v_n + 1;
  END LOOP;
  v_ok := FALSE;
  BEGIN
    INSERT INTO series_comments (series_id, user_id, body) VALUES (v_series, v_u1, 'one too many');
  EXCEPTION WHEN raise_exception THEN v_ok := TRUE; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'spam brake did not trigger'; END IF;

  -- author can delete own
  PERFORM set_config('request.jwt.claim.sub', v_u1::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM series_comments WHERE user_id = v_u1 AND body = 'I <3 this show & 2 > 1';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RESET ROLE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'author could not delete own comment'; END IF;

  RAISE NOTICE '✓ Show comments verified (RLS, validation, spam brake).';
END $$;

-- 9. Hall of Fame records: score math, ties, streaks, limited history, RLS
DO $$
DECLARE
  v_a UUID := gen_random_uuid();
  v_b UUID := gen_random_uuid();
  v_c UUID := gen_random_uuid();
  v_d UUID := gen_random_uuid();
  v_e UUID := gen_random_uuid();
  v_wiki NUMERIC;
  v_row RECORD;
  v_n INT;
BEGIN
  RAISE NOTICE 'Testing Hall of Fame records...';
  SELECT wiki_weight INTO v_wiki FROM score_weights WHERE id = 1;

  INSERT INTO series (id, tmdb_id, slug, title, network, network_group, genre_group, release_years, chart_color, wiki_slug, reddit_query, buzz_score)
  VALUES
    (v_a, 999981, 'hof-a', 'HoF A', 'TestNet', 'TestNet', 'Drama', '2019', '#111111', 'HoF_A', 'test', 0),
    (v_b, 999982, 'hof-b', 'HoF B', 'TestNet', 'TestNet', 'Drama', '2019', '#111111', 'HoF_B', 'test', 0),
    (v_c, 999983, 'hof-c', 'HoF C', 'TestNet', 'TestNet', 'Drama', '2019', '#111111', 'HoF_C', 'test', 0),
    (v_d, 999984, 'hof-d', 'HoF D', 'TestNet', 'TestNet', 'Drama', '2019', '#111111', 'HoF_D', 'test', 0),
    (v_e, 999985, 'hof-e', 'HoF E', 'TestNet', 'TestNet', 'Drama', '2019', '#111111', 'HoF_E', 'test', 0);

  -- Two full Monday-start weeks (2019-03-04 .. 2019-03-17) in the far past so no other data competes.
  -- Base order every day: A 1000 > B 900 > C 800 > D 700 wiki views.
  INSERT INTO series_daily_telemetry (series_id, recorded_date, wiki_views)
  SELECT s.id, d::DATE,
    CASE
      WHEN s.id = v_a AND d::DATE IN ('2019-03-05', '2019-03-14') THEN 6000
      WHEN s.id = v_a AND d::DATE = '2019-03-08' THEN 100
      WHEN s.id = v_b AND d::DATE = '2019-03-08' THEN 2000
      WHEN s.id = v_c AND d::DATE = '2019-03-12' THEN 4000
      WHEN s.id = v_d AND d::DATE = '2019-03-13' THEN 4000
      WHEN s.id = v_d AND d::DATE = '2019-03-04' THEN 0
      WHEN s.id = v_a THEN 1000
      WHEN s.id = v_b THEN 900
      WHEN s.id = v_c THEN 800
      ELSE 700
    END
  FROM (VALUES (v_a), (v_b), (v_c), (v_d)) AS s(id),
       generate_series('2019-03-04'::DATE, '2019-03-17'::DATE, INTERVAL '1 day') AS d;

  -- E has only two days of history and never ranks near the top.
  INSERT INTO series_daily_telemetry (series_id, recorded_date, wiki_views)
  VALUES (v_e, '2019-03-04', 10), (v_e, '2019-03-05', 10);

  -- A has three distinct breakout dates (two signals on one date); B has one.
  INSERT INTO series_breakouts (series_id, detected_date, signal, value, baseline_mean, baseline_std, pct_over_baseline, reason)
  VALUES
    (v_a, '2019-03-05', 'wiki', 1, 1, 1, 1, 't'), (v_a, '2019-03-05', 'reddit', 1, 1, 1, 1, 't'),
    (v_a, '2019-03-08', 'wiki', 1, 1, 1, 1, 't'), (v_a, '2019-03-14', 'wiki', 1, 1, 1, 1, 't'),
    (v_b, '2019-03-08', 'wiki', 1, 1, 1, 1, 't');

  -- record_day: score math uses derived weights; A's tie between 03-05 and 03-14 cites the earlier date.
  SELECT * INTO v_row FROM series_hall_of_fame WHERE category = 'record_day' AND series_id = v_a;
  IF v_row.value <> ROUND(6000 * v_wiki) OR v_row.start_date <> '2019-03-05' OR v_row.end_date <> '2019-03-05' THEN
    RAISE EXCEPTION 'record_day for A wrong: value %, % - %', v_row.value, v_row.start_date, v_row.end_date;
  END IF;

  -- Ties: C and D both peak at 4000 views -> same record_rank, C placed first (earlier date).
  IF (SELECT record_rank FROM series_hall_of_fame WHERE category = 'record_day' AND series_id = v_c)
     IS DISTINCT FROM (SELECT record_rank FROM series_hall_of_fame WHERE category = 'record_day' AND series_id = v_d) THEN
    RAISE EXCEPTION 'tied record days must share a record_rank';
  END IF;
  IF (SELECT place FROM series_hall_of_fame WHERE category = 'record_day' AND series_id = v_c)
     >= (SELECT place FROM series_hall_of_fame WHERE category = 'record_day' AND series_id = v_d) THEN
    RAISE EXCEPTION 'earlier achievement must be placed first on a tie';
  END IF;
  IF (SELECT place FROM series_hall_of_fame WHERE category = 'record_day' AND series_id = v_a)
     >= (SELECT place FROM series_hall_of_fame WHERE category = 'record_day' AND series_id = v_c) THEN
    RAISE EXCEPTION 'higher record must be placed first';
  END IF;

  -- Limited history: E has two days of data and ranks last, so it must not hold rank-based records
  -- (it may fall outside the top-10 record_day list when other fixtures exist).
  IF EXISTS (SELECT 1 FROM series_hall_of_fame WHERE series_id = v_e AND category <> 'record_day') THEN
    RAISE EXCEPTION 'a show with two days of data must not get rank-based records';
  END IF;

  -- top3_days: A 13, B 14, C 13, D 2 (days with at least 4 contending shows).
  SELECT COUNT(*) INTO v_n FROM series_hall_of_fame
  WHERE category = 'top3_days' AND (
    (series_id = v_a AND value = 13) OR (series_id = v_b AND value = 14) OR
    (series_id = v_c AND value = 13) OR (series_id = v_d AND value = 2));
  IF v_n <> 4 THEN RAISE EXCEPTION 'top3_days counts wrong (% of 4 matched)', v_n; END IF;

  -- number_one_streak: A is #1 on 03-04..07, 09..11, 14..17 -> longest 4, earliest run is cited.
  SELECT * INTO v_row FROM series_hall_of_fame WHERE category = 'number_one_streak' AND series_id = v_a;
  IF v_row.value <> 4 OR v_row.start_date <> '2019-03-04' OR v_row.end_date <> '2019-03-07' THEN
    RAISE EXCEPTION 'number_one_streak for A wrong: %, % - %', v_row.value, v_row.start_date, v_row.end_date;
  END IF;
  IF (SELECT value FROM series_hall_of_fame WHERE category = 'number_one_streak' AND series_id = v_b) <> 1 THEN
    RAISE EXCEPTION 'B should have a one day #1 streak';
  END IF;

  -- number_one_weeks: A wins both complete weeks; nobody else wins any.
  SELECT * INTO v_row FROM series_hall_of_fame WHERE category = 'number_one_weeks' AND series_id = v_a;
  IF v_row.value <> 2 OR v_row.start_date <> '2019-03-04' OR v_row.end_date <> '2019-03-17' THEN
    RAISE EXCEPTION 'number_one_weeks for A wrong: %, % - %', v_row.value, v_row.start_date, v_row.end_date;
  END IF;
  IF EXISTS (SELECT 1 FROM series_hall_of_fame WHERE category = 'number_one_weeks' AND series_id IN (v_b, v_c, v_d, v_e)) THEN
    RAISE EXCEPTION 'only A should hold weekly #1 records';
  END IF;

  -- breakout_events counts distinct dates, not signals.
  IF (SELECT value FROM series_hall_of_fame WHERE category = 'breakout_events' AND series_id = v_a) <> 3
     OR (SELECT value FROM series_hall_of_fame WHERE category = 'breakout_events' AND series_id = v_b) <> 1 THEN
    RAISE EXCEPTION 'breakout_events must count distinct dates';
  END IF;

  -- Each category is capped at 10 places.
  IF EXISTS (SELECT 1 FROM series_hall_of_fame WHERE place > 10) THEN
    RAISE EXCEPTION 'places beyond 10 must not be returned';
  END IF;

  -- RLS: public read works for anon, writes through the view do not.
  IF has_table_privilege('anon', 'public.series_hall_of_fame', 'INSERT')
     OR has_table_privilege('anon', 'public.series_hall_of_fame', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.series_hall_of_fame', 'DELETE') THEN
    RAISE EXCEPTION 'Hall of Fame view must not grant write privileges';
  END IF;
  SET LOCAL ROLE anon;
  SELECT COUNT(*) INTO v_n FROM series_hall_of_fame WHERE series_id = v_a;
  IF v_n < 1 THEN RAISE EXCEPTION 'anon must be able to read the hall of fame'; END IF;
  BEGIN
    UPDATE series_hall_of_fame SET value = 0;
    RAISE EXCEPTION 'anon must not be able to update the hall of fame view';
  EXCEPTION WHEN insufficient_privilege OR feature_not_supported OR object_not_in_prerequisite_state THEN
    NULL;
  END;
  RESET ROLE;

  RAISE NOTICE '✓ Hall of Fame records verified (math, ties, streaks, limited history, RLS).';
END $$;

-- 10. Follows, privacy and friends leaderboard (#192)
DO $$
DECLARE
  a UUID := gen_random_uuid(); b UUID := gen_random_uuid(); c UUID := gen_random_uuid();
  d UUID := gen_random_uuid(); e UUID := gen_random_uuid(); f UUID := gen_random_uuid();
  g UUID := gen_random_uuid();
  v_n INT; v_ok BOOLEAN; v_row RECORD; v_status TEXT;
  v_updated_before TIMESTAMPTZ; v_updated_after TIMESTAMPTZ;
  v_day DATE := '2019-05-01';
BEGIN
  RAISE NOTICE 'Testing follows and privacy...';
  INSERT INTO auth.users (id, email) VALUES
    (a, 'friend_a@example.com'), (b, 'friend_b@example.com'), (c, 'friend_c@example.com'), (d, 'friend_d@example.com'),
    (e, 'friend_e@example.com'), (f, 'friend_f@example.com'), (g, 'friend_g@example.com');
  UPDATE profiles SET username = 'fx_a', current_streak = 3, best_streak = 905 WHERE id = a;
  UPDATE profiles SET username = 'fx_b', current_streak = 8, best_streak = 908 WHERE id = b;
  UPDATE profiles SET username = 'fx_c', current_streak = 2, best_streak = 910, stats_visibility = 'followers' WHERE id = c;
  UPDATE profiles SET username = 'fx_d', current_streak = 4, best_streak = 904 WHERE id = d;
  UPDATE profiles SET username = 'fx_e', current_streak = 1, best_streak = 901 WHERE id = e;
  UPDATE profiles SET username = 'fx_f', current_streak = 1, best_streak = 1 WHERE id = f;
  UPDATE profiles SET username = 'fx_g', current_streak = 1, best_streak = 1, stats_visibility = 'followers' WHERE id = g;

  INSERT INTO user_scores (user_id, date, score, completed_at) VALUES
    (a, v_day, 7, '2019-05-01 12:00Z'), (a, v_day + 1, 5, '2019-05-02 12:00Z'), (a, v_day + 2, 8, '2019-05-03 12:00Z'),
    (b, v_day, 9, '2019-05-01 10:00Z'), (b, v_day + 1, 5, '2019-05-02 10:00Z'), (b, v_day + 2, 6, '2019-05-03 10:00Z'),
    (c, v_day, 9, '2019-05-01 09:00Z');

  -- anon cannot touch follows
  SET LOCAL ROLE anon;
  v_ok := FALSE;
  BEGIN PERFORM 1 FROM user_follows; EXCEPTION WHEN insufficient_privilege THEN v_ok := TRUE; END;
  RESET ROLE;
  IF NOT v_ok THEN RAISE EXCEPTION 'anon must not read user_follows'; END IF;
  IF has_function_privilege('anon', 'public.profiles_accept_pending_on_public()', 'EXECUTE') THEN
    RAISE EXCEPTION 'trigger function must not be directly executable by anon';
  END IF;
  IF has_function_privilege('authenticated', 'public.profiles_set_updated_at()', 'EXECUTE') THEN
    RAISE EXCEPTION 'timestamp trigger function must not be directly executable';
  END IF;
  IF has_table_privilege('anon', 'public.profiles', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
     OR has_table_privilege('anon', 'public.profiles', 'INSERT')
     OR has_table_privilege('authenticated', 'public.profiles', 'INSERT')
     OR has_column_privilege('authenticated', 'public.profiles', 'current_streak', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.profiles', 'best_streak', 'UPDATE') THEN
    RAISE EXCEPTION 'profile table writes must be limited to explicitly granted columns';
  END IF;

  -- Username edits must work without granting direct updated_at writes; the trigger owns that column.
  SELECT updated_at INTO v_updated_before FROM profiles WHERE id = a;
  PERFORM set_config('request.jwt.claim.sub', a::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE profiles SET username = 'fx_a' WHERE id = a;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RESET ROLE;
  SELECT updated_at INTO v_updated_after FROM profiles WHERE id = a;
  IF v_n <> 1 OR v_updated_after <= v_updated_before THEN
    RAISE EXCEPTION 'authorized profile update must succeed and advance updated_at';
  END IF;
  SET LOCAL ROLE authenticated;
  v_ok := FALSE;
  BEGIN
    UPDATE profiles SET updated_at = clock_timestamp() WHERE id = a;
  EXCEPTION WHEN insufficient_privilege THEN v_ok := TRUE; END;
  RESET ROLE;
  IF NOT v_ok THEN RAISE EXCEPTION 'clients must not write profile updated_at directly'; END IF;

  -- A follows B (public -> accepted) and C (followers-only -> pending)
  PERFORM set_config('request.jwt.claim.sub', a::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO user_follows (follower_id, followee_id) VALUES (a, b), (a, c), (a, d), (a, f), (a, g);
  SELECT status INTO v_status FROM user_follows WHERE follower_id = a AND followee_id = b;
  IF v_status <> 'accepted' THEN RESET ROLE; RAISE EXCEPTION 'follow of a public profile must be accepted, got %', v_status; END IF;
  SELECT status INTO v_status FROM user_follows WHERE follower_id = a AND followee_id = c;
  IF v_status <> 'pending' THEN RESET ROLE; RAISE EXCEPTION 'follow of a followers-only profile must be pending, got %', v_status; END IF;

  -- no self follow, no forged follower, no self-approval, no status on insert
  v_ok := FALSE;
  BEGIN INSERT INTO user_follows (follower_id, followee_id) VALUES (a, a);
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN v_ok := TRUE; END;
  IF NOT v_ok THEN RESET ROLE; RAISE EXCEPTION 'self follow must be rejected'; END IF;
  v_ok := FALSE;
  BEGIN INSERT INTO user_follows (follower_id, followee_id) VALUES (b, e);
  EXCEPTION WHEN insufficient_privilege THEN v_ok := TRUE; END;
  IF NOT v_ok THEN RESET ROLE; RAISE EXCEPTION 'forged follower_id must be rejected'; END IF;
  UPDATE user_follows SET status = 'accepted' WHERE follower_id = a AND followee_id = c;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RESET ROLE; RAISE EXCEPTION 'follower must not approve own request'; END IF;
  v_ok := FALSE;
  BEGIN EXECUTE 'INSERT INTO user_follows (follower_id, followee_id, status) VALUES ($1, $2, ''accepted'')' USING a, e;
  EXCEPTION WHEN insufficient_privilege THEN v_ok := TRUE; END;
  IF NOT v_ok THEN RESET ROLE; RAISE EXCEPTION 'status must not be insertable'; END IF;

  -- stats columns are hidden from direct reads; usernames are not
  v_ok := FALSE;
  BEGIN EXECUTE 'SELECT current_streak FROM profiles LIMIT 1'; EXCEPTION WHEN insufficient_privilege THEN v_ok := TRUE; END;
  IF NOT v_ok THEN RESET ROLE; RAISE EXCEPTION 'streak columns must not be directly readable'; END IF;
  PERFORM username FROM profiles LIMIT 1;

  -- visibility matrix from A's view: self, public, pending followers-only, accepted
  IF NOT (EXISTS (SELECT 1 FROM get_profile_stats(ARRAY[a])) AND EXISTS (SELECT 1 FROM get_profile_stats(ARRAY[b])) AND EXISTS (SELECT 1 FROM get_profile_stats(ARRAY[d]))) THEN RESET ROLE; RAISE EXCEPTION 'public and own stats must be visible'; END IF;
  IF EXISTS (SELECT 1 FROM get_profile_stats(ARRAY[c])) THEN RESET ROLE; RAISE EXCEPTION 'pending request must not unlock followers-only stats'; END IF;

  -- head to head: hidden while pending, visible stats for public opponent with correct aggregates
  SELECT * INTO v_row FROM head_to_head('fx_c', v_day);
  IF v_row.visible OR v_row.their_best_streak IS NOT NULL THEN RESET ROLE; RAISE EXCEPTION 'head_to_head must hide followers-only stats'; END IF;
  SELECT * INTO v_row FROM head_to_head('FX_B ', v_day);
  IF NOT v_row.visible OR v_row.shared_days <> 3 OR v_row.my_wins <> 1 OR v_row.their_wins <> 1 OR v_row.ties <> 1
     OR v_row.my_score_today <> 7 OR v_row.their_score_today <> 9
     OR v_row.my_current_streak <> 3 OR v_row.their_current_streak <> 8 OR v_row.their_best_streak <> 908 THEN
    RESET ROLE; RAISE EXCEPTION 'head_to_head aggregates wrong: %', v_row;
  END IF;
  SELECT * INTO v_row FROM head_to_head('fx_d', v_day);
  IF NOT v_row.visible OR v_row.shared_days <> 0 OR v_row.my_wins <> 0 THEN RESET ROLE; RAISE EXCEPTION 'no shared days must give zero counts'; END IF;
  IF EXISTS (SELECT 1 FROM head_to_head('fx_a', v_day)) OR EXISTS (SELECT 1 FROM head_to_head('nobody_here', v_day)) THEN
    RESET ROLE; RAISE EXCEPTION 'head_to_head must return nothing for self or unknown users';
  END IF;

  -- public leaderboard hides C (followers-only, not accepted) from A
  IF EXISTS (SELECT 1 FROM daily_leaderboard(v_day) WHERE username = 'fx_c') THEN RESET ROLE; RAISE EXCEPTION 'followers-only player leaked into daily leaderboard'; END IF;
  IF EXISTS (SELECT 1 FROM streak_leaderboard() WHERE username = 'fx_c') THEN RESET ROLE; RAISE EXCEPTION 'followers-only player leaked into streak leaderboard'; END IF;
  RESET ROLE;
  SET LOCAL ROLE anon;
  IF EXISTS (SELECT 1 FROM daily_leaderboard(v_day) WHERE username = 'fx_c') THEN RESET ROLE; RAISE EXCEPTION 'followers-only player leaked to anon'; END IF;
  IF NOT EXISTS (SELECT 1 FROM daily_leaderboard(v_day) WHERE username = 'fx_b') THEN RESET ROLE; RAISE EXCEPTION 'public players must stay on the leaderboard'; END IF;
  IF EXISTS (SELECT 1 FROM get_profile_stats(ARRAY[c, g])) OR NOT EXISTS (SELECT 1 FROM get_profile_stats(ARRAY[b])) THEN RESET ROLE; RAISE EXCEPTION 'get_profile_stats must respect privacy for anon'; END IF;
  v_ok := FALSE;
  BEGIN PERFORM friends_leaderboard(v_day); EXCEPTION WHEN insufficient_privilege THEN v_ok := TRUE; END;
  IF NOT v_ok THEN RESET ROLE; RAISE EXCEPTION 'anon must not call friends_leaderboard'; END IF;
  RESET ROLE;

  -- C sees the request, accepts it; A cannot see unrelated follows
  PERFORM set_config('request.jwt.claim.sub', c::text, true);
  SET LOCAL ROLE authenticated;
  SELECT COUNT(*) INTO v_n FROM user_follows;
  IF v_n <> 1 THEN RESET ROLE; RAISE EXCEPTION 'C should only see the one request addressed to them, saw %', v_n; END IF;
  UPDATE user_follows SET status = 'accepted' WHERE followee_id = c AND follower_id = a AND status = 'pending';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RESET ROLE; RAISE EXCEPTION 'followee could not accept request'; END IF;
  -- followee cannot set arbitrary statuses back or edit other columns
  v_ok := FALSE;
  BEGIN EXECUTE 'UPDATE user_follows SET follower_id = $1 WHERE followee_id = $2' USING e, c;
  EXCEPTION WHEN insufficient_privilege THEN v_ok := TRUE; END;
  IF NOT v_ok THEN RESET ROLE; RAISE EXCEPTION 'follower_id must not be updatable'; END IF;
  -- cannot edit someone else's privacy; own value validated
  UPDATE profiles SET stats_visibility = 'public' WHERE id = a;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RESET ROLE; RAISE EXCEPTION 'users must not change other profiles'; END IF;
  v_ok := FALSE;
  BEGIN UPDATE profiles SET stats_visibility = 'friends' WHERE id = c; EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
  IF NOT v_ok THEN RESET ROLE; RAISE EXCEPTION 'invalid stats_visibility accepted'; END IF;
  RESET ROLE;

  -- B and E follow A back (mutual with B; E is a follower A does not follow)
  PERFORM set_config('request.jwt.claim.sub', b::text, true);
  SET LOCAL ROLE authenticated; INSERT INTO user_follows (follower_id, followee_id) VALUES (b, a); RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', e::text, true);
  SET LOCAL ROLE authenticated; INSERT INTO user_follows (follower_id, followee_id) VALUES (e, a); RESET ROLE;

  -- friends leaderboard for A: A, B, C (accepted), D, F, but not E or the pending G
  PERFORM set_config('request.jwt.claim.sub', a::text, true);
  SET LOCAL ROLE authenticated;
  IF NOT EXISTS (SELECT 1 FROM get_profile_stats(ARRAY[c])) THEN RESET ROLE; RAISE EXCEPTION 'accepted follower must see followers-only stats'; END IF;
  SELECT COUNT(*) INTO v_n FROM friends_leaderboard(v_day);
  IF v_n <> 5 THEN RESET ROLE; RAISE EXCEPTION 'friends circle should have 5 members, got %', v_n; END IF;
  IF EXISTS (SELECT 1 FROM friends_leaderboard(v_day) WHERE username IN ('fx_e', 'fx_g')) THEN RESET ROLE; RAISE EXCEPTION 'followers and pending requests are not friends'; END IF;
  -- C and B tie on 9; C completed earlier so ranks 1; A (7) ranks 3; D and F have no score
  IF (SELECT daily_rank FROM friends_leaderboard(v_day) WHERE username = 'fx_c') <> 1
     OR (SELECT daily_rank FROM friends_leaderboard(v_day) WHERE username = 'fx_b') <> 2
     OR (SELECT daily_rank FROM friends_leaderboard(v_day) WHERE username = 'fx_a') <> 3
     OR EXISTS (SELECT 1 FROM friends_leaderboard(v_day) WHERE username IN ('fx_d', 'fx_f') AND (daily_rank IS NOT NULL OR score IS NOT NULL)) THEN
    RESET ROLE; RAISE EXCEPTION 'daily friend ranks wrong';
  END IF;
  -- streak ranks: B 8, D 4, A 3, C 2, F 1
  IF (SELECT array_agg(username ORDER BY streak_rank) FROM friends_leaderboard(v_day)) IS DISTINCT FROM ARRAY['fx_b','fx_d','fx_a','fx_c','fx_f'] THEN
    RESET ROLE; RAISE EXCEPTION 'streak ranks wrong';
  END IF;
  IF NOT (SELECT is_self FROM friends_leaderboard(v_day) WHERE username = 'fx_a')
     OR NOT (SELECT is_mutual FROM friends_leaderboard(v_day) WHERE username = 'fx_b')
     OR (SELECT is_mutual FROM friends_leaderboard(v_day) WHERE username = 'fx_c')
     OR (SELECT is_mutual FROM friends_leaderboard(v_day) WHERE username = 'fx_a') THEN
    RESET ROLE; RAISE EXCEPTION 'is_self / is_mutual flags wrong';
  END IF;
  -- now that C is accepted, head to head works and C shows on the public board for A
  IF NOT (SELECT visible FROM head_to_head('fx_c', v_day)) THEN RESET ROLE; RAISE EXCEPTION 'accepted follow must unlock head_to_head'; END IF;
  IF NOT EXISTS (SELECT 1 FROM daily_leaderboard(v_day) WHERE username = 'fx_c') THEN RESET ROLE; RAISE EXCEPTION 'accepted follower should see C on leaderboard'; END IF;
  RESET ROLE;

  -- switching G to public resolves its pending request
  PERFORM set_config('request.jwt.claim.sub', g::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE profiles SET stats_visibility = 'public' WHERE id = g;
  RESET ROLE;
  IF (SELECT status FROM user_follows WHERE follower_id = a AND followee_id = g) <> 'accepted' THEN
    RAISE EXCEPTION 'going public must accept pending requests';
  END IF;

  -- either side can end a follow: E removes follower... A removes own follow of D, B removes A's follow of B
  PERFORM set_config('request.jwt.claim.sub', b::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM user_follows WHERE follower_id = a AND followee_id = b;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RESET ROLE;
  IF v_n <> 1 THEN RAISE EXCEPTION 'followee must be able to remove a follower'; END IF;
  PERFORM set_config('request.jwt.claim.sub', d::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM user_follows WHERE follower_id = a AND followee_id = f;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RESET ROLE;
  IF v_n <> 0 THEN RAISE EXCEPTION 'unrelated users must not delete follows'; END IF;

  -- follow limit: 200 per follower
  INSERT INTO auth.users (id, email) SELECT gen_random_uuid(), 'lim' || n || '@example.com' FROM generate_series(1, 200) n;
  INSERT INTO user_follows (follower_id, followee_id)
    SELECT e, p.id FROM profiles p WHERE p.id NOT IN (e, a) AND p.username <> 'fx_c' ORDER BY p.id LIMIT 199;
  v_ok := FALSE;
  BEGIN INSERT INTO user_follows (follower_id, followee_id) SELECT e, p.id FROM profiles p
    WHERE p.id NOT IN (e) AND NOT EXISTS (SELECT 1 FROM user_follows u WHERE u.follower_id = e AND u.followee_id = p.id) LIMIT 2;
  EXCEPTION WHEN raise_exception THEN v_ok := TRUE; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'follow limit did not trigger'; END IF;

  RAISE NOTICE '✓ Follows, privacy and friends leaderboard verified.';
END $$;

-- 11. Secondary signals: nullable columns, constraints, public read, no public write (#193)
DO $$
DECLARE
  v_series UUID := gen_random_uuid();
  v_ok BOOLEAN;
  v_n INT;
  v_score_before BIGINT;
  v_score_after BIGINT;
BEGIN
  RAISE NOTICE 'Testing secondary signals...';
  INSERT INTO series (id, tmdb_id, slug, title, network, network_group, genre_group, release_years, chart_color, wiki_slug, reddit_query, buzz_score)
  VALUES (v_series, 999941, 'sec-show', 'Secondary Show', 'TestNet', 'TestNet', 'Drama', '2019', '#111111', 'Sec_Show', 'test', 0);

  -- Rows without secondary signals stay valid and keep NULLs (not zeros)
  INSERT INTO series_daily_telemetry (series_id, recorded_date, wiki_views) VALUES (v_series, '2019-06-01', 1000);
  IF EXISTS (SELECT 1 FROM series_daily_telemetry WHERE series_id = v_series AND recorded_date = '2019-06-01'
             AND (social_mentions IS NOT NULL OR imdb_rating IS NOT NULL OR imdb_votes IS NOT NULL OR imdb_episode IS NOT NULL)) THEN
    RAISE EXCEPTION 'secondary signals must default to NULL';
  END IF;

  SELECT daily_score INTO v_score_before FROM series_daily_scores WHERE series_id = v_series AND recorded_date = '2019-06-01';

  INSERT INTO series_daily_telemetry (series_id, recorded_date, wiki_views, social_mentions, imdb_rating, imdb_votes, imdb_episode)
  VALUES (v_series, '2019-06-02', 1000, 5400, 8.7, 2100, 'S02E05');
  IF (SELECT imdb_rating FROM series_daily_telemetry WHERE series_id = v_series AND recorded_date = '2019-06-02') <> 8.7 THEN
    RAISE EXCEPTION 'imdb_rating not stored';
  END IF;

  -- Core score is unaffected by secondary signals (same wiki views, huge mentions)
  SELECT daily_score INTO v_score_after FROM series_daily_scores WHERE series_id = v_series AND recorded_date = '2019-06-02';
  IF v_score_before IS DISTINCT FROM v_score_after THEN
    RAISE EXCEPTION 'secondary signals must not change core scores (% vs %)', v_score_before, v_score_after;
  END IF;

  -- Constraints
  FOR v_n IN 1..6 LOOP
    v_ok := FALSE;
    BEGIN
      IF v_n = 1 THEN INSERT INTO series_daily_telemetry (series_id, recorded_date, social_mentions) VALUES (v_series, '2019-06-10', -1);
      ELSIF v_n = 2 THEN INSERT INTO series_daily_telemetry (series_id, recorded_date, imdb_rating) VALUES (v_series, '2019-06-10', 10.5);
      ELSIF v_n = 3 THEN INSERT INTO series_daily_telemetry (series_id, recorded_date, imdb_rating) VALUES (v_series, '2019-06-10', 0.5);
      ELSIF v_n = 4 THEN INSERT INTO series_daily_telemetry (series_id, recorded_date, imdb_votes) VALUES (v_series, '2019-06-10', -5);
      ELSIF v_n = 5 THEN INSERT INTO series_daily_telemetry (series_id, recorded_date, imdb_episode) VALUES (v_series, '2019-06-10', 'season 2 ep 5');
      ELSE UPDATE series SET imdb_id = 'nm0000001' WHERE id = v_series;
      END IF;
    EXCEPTION WHEN check_violation THEN v_ok := TRUE; END;
    IF NOT v_ok THEN RAISE EXCEPTION 'invalid secondary signal accepted (case %)', v_n; END IF;
  END LOOP;
  UPDATE series SET imdb_id = 'tt11280740' WHERE id = v_series;

  -- Public can read the columns but cannot write them
  SET LOCAL ROLE anon;
  SELECT COUNT(*) INTO v_n FROM series_daily_telemetry WHERE series_id = v_series AND social_mentions = 5400;
  IF v_n <> 1 THEN RESET ROLE; RAISE EXCEPTION 'anon should read secondary signals'; END IF;
  v_ok := FALSE;
  BEGIN
    UPDATE series_daily_telemetry SET social_mentions = 1 WHERE series_id = v_series;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN v_ok := TRUE; END IF;
  EXCEPTION WHEN insufficient_privilege THEN v_ok := TRUE; END;
  RESET ROLE;
  IF NOT v_ok THEN RAISE EXCEPTION 'anon must not be able to write secondary signals'; END IF;
  IF (SELECT social_mentions FROM series_daily_telemetry WHERE series_id = v_series AND recorded_date = '2019-06-02') <> 5400 THEN
    RAISE EXCEPTION 'anon write changed data';
  END IF;

  RAISE NOTICE '✓ Secondary signals verified (nullable, constraints, core score unchanged, read-only for public).';
END $$;

-- 13. Premiere impact view: windows, multipliers, coverage and privileges (#195)
DO $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'UTC')::DATE;
  v_e1 DATE := v_today - 60;
  v_e2 DATE := v_today - 20;
  v_e3 DATE := v_today - 4;
  v_wiki NUMERIC;
  v_p UUID := gen_random_uuid(); v_q UUID := gen_random_uuid(); v_r UUID := gen_random_uuid();
  v_row RECORD; v_n INT;
BEGIN
  RAISE NOTICE 'Testing premiere impact view...';
  DELETE FROM series_daily_telemetry;
  SELECT wiki_weight INTO v_wiki FROM score_weights WHERE id = 1;

  INSERT INTO series (id, tmdb_id, slug, title, network, network_group, genre_group, release_years, chart_color, wiki_slug, reddit_query, buzz_score)
  VALUES
    (v_p, 999931, 'pi-p', 'Pi P', 'N', 'PiNet', 'PiDrama', '2019', '#111111', 'P_P', 't', 0),
    (v_q, 999932, 'pi-q', 'Pi Q', 'N', 'PiNet', 'PiDrama', '2019', '#111111', 'P_Q', 't', 0),
    (v_r, 999933, 'pi-r', 'Pi R', 'N', 'PiNet', 'PiDrama', '2019', '#111111', 'P_R', 't', 0);

  -- P: season 1 premiere 1000 -> 3000 (x3), season 2 premiere 2000 -> 3000 (x1.5), pre/post windows complete
  INSERT INTO series_daily_telemetry (series_id, recorded_date, wiki_views, reddit_comments, reddit_upvotes, reddit_observed)
  SELECT v_p, v_e1 + d, CASE WHEN d < 0 THEN 1000 ELSE 3000 END, NULL, NULL, FALSE FROM generate_series(-7, 6) d;
  INSERT INTO series_daily_telemetry (series_id, recorded_date, wiki_views, reddit_comments, reddit_upvotes, reddit_observed)
  SELECT v_p, v_e2 + d, CASE WHEN d < 0 THEN 2000 ELSE 3000 END, NULL, NULL, FALSE FROM generate_series(-7, 6) d;
  -- P third premiere only 4 days ago: post window is partial (5 observed days) but still qualifies
  INSERT INTO series_daily_telemetry (series_id, recorded_date, wiki_views, reddit_comments, reddit_upvotes, reddit_observed)
  SELECT v_p, v_e3 + d, 3000, NULL, NULL, FALSE FROM generate_series(-7, 4) d
  ON CONFLICT (series_id, recorded_date) DO NOTHING;
  -- Q: zero baseline (views 0 before), so no multiplier but a delta
  INSERT INTO series_daily_telemetry (series_id, recorded_date, wiki_views, reddit_comments, reddit_upvotes, reddit_observed)
  SELECT v_q, v_e2 + d, CASE WHEN d < 0 THEN 0 ELSE 500 END, NULL, NULL, FALSE FROM generate_series(-7, 6) d;
  -- R: only 3 pre-premiere days, must be excluded
  INSERT INTO series_daily_telemetry (series_id, recorded_date, wiki_views, reddit_comments, reddit_upvotes, reddit_observed)
  SELECT v_r, v_e2 + d, 1000, NULL, NULL, FALSE FROM generate_series(-3, 6) d;

  INSERT INTO series_events (series_id, event_date, kind, label) VALUES
    (v_p, v_e1, 'season_premiere', 'Season 1'),
    (v_p, v_e2, 'season_premiere', 'Season 2'),
    (v_p, v_e3, 'season_premiere', 'Season 3'),
    (v_p, v_e2 + 1, 'season_finale', 'Ignored finale'),
    (v_q, v_e2, 'season_premiere', 'Q premiere'),
    (v_r, v_e2, 'season_premiere', 'R premiere');

  SELECT * INTO v_row FROM series_premiere_impact WHERE series_id = v_p AND event_date = v_e1;
  IF v_row.premiere_number <> 1 OR v_row.pre_days <> 7 OR v_row.post_days <> 7 THEN
    RAISE EXCEPTION 'S1 windows wrong: %', v_row;
  END IF;
  IF abs(v_row.pre_avg - 1000 * v_wiki) > 0.01 OR abs(v_row.post_avg - 3000 * v_wiki) > 0.01 THEN
    RAISE EXCEPTION 'S1 averages not derived from score_weights: %', v_row;
  END IF;
  IF v_row.multiplier <> 3.00 THEN RAISE EXCEPTION 'S1 multiplier expected 3.00, got %', v_row.multiplier; END IF;
  IF abs(v_row.delta - 2000 * v_wiki) > 0.01 THEN RAISE EXCEPTION 'S1 delta wrong: %', v_row.delta; END IF;

  SELECT * INTO v_row FROM series_premiere_impact WHERE series_id = v_p AND event_date = v_e2;
  IF v_row.premiere_number <> 2 OR v_row.multiplier <> 1.50 THEN RAISE EXCEPTION 'S2 wrong: %', v_row; END IF;

  SELECT * INTO v_row FROM series_premiere_impact WHERE series_id = v_p AND event_date = v_e3;
  IF v_row.premiere_number <> 3 OR v_row.post_days <> 5 OR v_row.pre_days <> 7 THEN
    RAISE EXCEPTION 'partial post window must be capped at today: %', v_row;
  END IF;

  SELECT * INTO v_row FROM series_premiere_impact WHERE series_id = v_q;
  IF v_row.multiplier IS NOT NULL OR v_row.delta <= 0 THEN RAISE EXCEPTION 'zero baseline must give NULL multiplier: %', v_row; END IF;

  SELECT COUNT(*) INTO v_n FROM series_premiere_impact WHERE series_id = v_r;
  IF v_n <> 0 THEN RAISE EXCEPTION 'show with <4 pre days must be excluded'; END IF;
  SELECT COUNT(*) INTO v_n FROM series_premiere_impact WHERE label = 'Ignored finale';
  IF v_n <> 0 THEN RAISE EXCEPTION 'only season_premiere events are analysed'; END IF;

  SET LOCAL ROLE anon;
  SELECT COUNT(*) INTO v_n FROM series_premiere_impact;
  RESET ROLE;
  IF v_n < 4 THEN RAISE EXCEPTION 'anon must read premiere impact'; END IF;
  SELECT COUNT(*) INTO v_n FROM information_schema.role_table_grants
    WHERE table_name = 'series_premiere_impact' AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC') AND privilege_type <> 'SELECT';
  IF v_n <> 0 THEN RAISE EXCEPTION 'series_premiere_impact must be read-only'; END IF;

  RAISE NOTICE '✓ Premiere impact verified.';
END $$;
END $$;

ROLLBACK;

\echo '===================================='
\echo 'All Supabase Smoke Tests Passed! 🎉'
\echo '===================================='
