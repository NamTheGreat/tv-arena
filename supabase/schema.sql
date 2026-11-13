-- TV Arena Complete PostgreSQL Schema + Initial Seed Data
CREATE TABLE IF NOT EXISTS series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tmdb_id INT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  network TEXT NOT NULL,
  network_group TEXT NOT NULL DEFAULT 'Other',
  genre_group TEXT NOT NULL DEFAULT 'Drama & Sci-Fi',
  release_years TEXT NOT NULL DEFAULT '2024–2025',
  chart_color TEXT DEFAULT '#C66A3D',
  wiki_slug TEXT NOT NULL,
  reddit_query TEXT NOT NULL,
  buzz_score BIGINT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_series_title_search ON series USING gin (to_tsvector('english', title));

CREATE TABLE IF NOT EXISTS series_daily_telemetry (
  id BIGSERIAL PRIMARY KEY,
  series_id UUID REFERENCES series(id) ON DELETE CASCADE,
  recorded_date DATE NOT NULL DEFAULT CURRENT_DATE,
  daily_score BIGINT NOT NULL DEFAULT 0,
  wiki_views INT DEFAULT 0,
  reddit_comments INT,
  reddit_upvotes INT,
  reddit_observed BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (series_id, recorded_date)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_series_date ON series_daily_telemetry(series_id, recorded_date DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_recorded_date ON series_daily_telemetry(recorded_date DESC);

-- Score Weights Configuration
CREATE TABLE IF NOT EXISTS score_weights (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  wiki_weight NUMERIC NOT NULL DEFAULT 10,
  comment_weight NUMERIC NOT NULL DEFAULT 150,
  upvote_weight NUMERIC NOT NULL DEFAULT 25,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE score_weights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read on score_weights" ON score_weights;
CREATE POLICY "Allow public read on score_weights" ON score_weights FOR SELECT USING (true);

INSERT INTO score_weights (id, wiki_weight, comment_weight, upvote_weight)
VALUES (1, 10, 150, 25)
ON CONFLICT (id) DO NOTHING;

-- Views: series_daily_scores & series_leaderboard
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
    (COALESCE(t.reddit_comments, 0) * w.comment_weight) +
    (COALESCE(t.reddit_upvotes, 0) * w.upvote_weight)
  )::BIGINT AS daily_score
FROM series_daily_telemetry t
CROSS JOIN (SELECT wiki_weight, comment_weight, upvote_weight FROM score_weights WHERE id = 1 LIMIT 1) w;

GRANT SELECT ON series_daily_scores TO anon, authenticated;

CREATE OR REPLACE VIEW series_signal_contributions
WITH (security_invoker = on) AS
WITH anchor AS (
  SELECT COALESCE(MAX(recorded_date), CURRENT_DATE) AS max_date
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
  )::BIGINT AS reddit_observed_days
FROM series s
CROSS JOIN anchor a
CROSS JOIN score_weights w
LEFT JOIN series_daily_telemetry t
  ON t.series_id = s.id
  AND t.recorded_date > a.max_date - INTERVAL '7 days'
  AND t.recorded_date <= a.max_date
WHERE w.id = 1
GROUP BY s.id, w.wiki_weight, w.comment_weight, w.upvote_weight;

GRANT SELECT ON series_signal_contributions TO anon, authenticated;

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
  current_7d_score,
  current_7d_score AS buzz_score,
  previous_7d_score,
  CASE
    WHEN previous_7d_score > 0 THEN
      ROUND(((current_7d_score - previous_7d_score)::numeric / previous_7d_score::numeric) * 100, 2)
    ELSE NULL
  END AS delta_pct,
  ROW_NUMBER() OVER (ORDER BY current_7d_score DESC, title ASC) as rank,
  network_group
FROM daily_buckets;

GRANT SELECT ON series_leaderboard TO anon, authenticated;

CREATE OR REPLACE VIEW series_deck_candidates
WITH (security_invoker = on) AS
WITH anchor AS (
  SELECT COALESCE(MAX(recorded_date), CURRENT_DATE) AS max_date
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

GRANT SELECT ON series_deck_candidates TO anon, authenticated;

-- Aggregate recent 90-day telemetry as arrays to guarantee 1 row per show (bypasses 1,000-row PostgREST limits)
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

-- Enable public read-only access for the React frontend
ALTER TABLE series ENABLE ROW LEVEL SECURITY;
ALTER TABLE series_daily_telemetry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on series" ON series;
CREATE POLICY "Allow public read on series" ON series FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public read on telemetry" ON series_daily_telemetry;
CREATE POLICY "Allow public read on telemetry" ON series_daily_telemetry FOR SELECT USING (true);

-- Seed initial flagship shows with zeroed metrics ready for telemetry sync
INSERT INTO series (tmdb_id, slug, title, network, network_group, genre_group, release_years, chart_color, wiki_slug, reddit_query, buzz_score)
VALUES
  (66732, 'stranger-things', 'Stranger Things', 'Netflix', 'Netflix', 'Drama & Sci-Fi', '2024–2025', '#C66A3D', 'Stranger_Things', '"Stranger Things" (Netflix OR episode OR season)', 0),
  (119051, 'wednesday', 'Wednesday', 'Netflix', 'Netflix', 'Drama & Sci-Fi', '2024–2025', '#5C828C', 'Wednesday_(TV_series)', '"Wednesday" (Netflix OR Jenna Ortega OR season)', 0),
  (94997, 'house-of-the-dragon', 'House of the Dragon', 'HBO', 'HBO', 'Drama & Sci-Fi', '2024–2025', '#C59A44', 'House_of_the_Dragon', '"House of the Dragon" (HBO OR episode OR season)', 0),
  (95396, 'severance', 'Severance', 'Apple TV+', 'Apple TV+', 'Drama & Sci-Fi', '2024–2025', '#C66A3D', 'Severance_(TV_series)', '"Severance" (Apple OR Lumon OR episode)', 0),
  (100088, 'the-last-of-us', 'The Last of Us', 'HBO', 'HBO', 'Drama & Sci-Fi', '2024–2025', '#886F99', 'The_Last_of_Us_(TV_series)', '"The Last of Us" (HBO OR Joel OR Ellie)', 0),
  (136315, 'the-bear', 'The Bear', 'FX / Hulu', 'FX / Hulu', 'Comedy & Drama', '2024–2025', '#5C828C', 'The_Bear_(TV_series)', '"The Bear" (Hulu OR FX OR Carmy)', 0),
  (91239, 'bridgerton', 'Bridgerton', 'Netflix', 'Netflix', 'Drama', '2024–2025', '#6E8761', 'Bridgerton', '"Bridgerton" (Netflix OR season OR episode)', 0),
  (111803, 'the-white-lotus', 'The White Lotus', 'HBO', 'HBO', 'Drama', '2024–2025', '#A65D67', 'The_White_Lotus', '"The White Lotus" (HBO OR episode OR finale)', 0),
  (76479, 'the-boys', 'The Boys', 'Prime Video', 'Prime Video', 'Drama & Sci-Fi', '2024–2025', '#C59A44', 'The_Boys_(TV_series)', '"The Boys" (Prime OR Homelander OR episode)', 0),
  (106379, 'fallout', 'Fallout', 'Prime Video', 'Prime Video', 'Drama & Sci-Fi', '2024–2025', '#6E8761', 'Fallout_(American_TV_series)', '"Fallout" (Prime OR Vault OR episode)', 0),
  (76331, 'succession', 'Succession', 'HBO', 'HBO', 'Drama', '2023–2024', '#886F99', 'Succession_(TV_series)', '"Succession" (HBO OR Kendall OR Roy)', 0),
  (125988, 'silo', 'Silo', 'Apple TV+', 'Apple TV+', 'Drama & Sci-Fi', '2024–2025', '#5C828C', 'Silo_(TV_series)', '"Silo" (Apple OR Juliette OR episode)', 0)
ON CONFLICT (tmdb_id) DO NOTHING;


-- Series Event Annotations
CREATE TABLE IF NOT EXISTS series_events (
  id BIGSERIAL PRIMARY KEY,
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('premiere', 'finale', 'season_premiere', 'season_finale')),
  label TEXT NOT NULL,
  source TEXT DEFAULT 'tmdb',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(series_id, event_date, kind)
);

CREATE INDEX IF NOT EXISTS idx_series_events_date ON series_events(event_date);
CREATE INDEX IF NOT EXISTS idx_series_events_series ON series_events(series_id, event_date);

ALTER TABLE series_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read on series_events" ON series_events;
CREATE POLICY "Allow public read on series_events" ON series_events FOR SELECT USING (true);
-- Anomaly and Breakout Detection
CREATE TABLE IF NOT EXISTS series_breakouts (
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  detected_date DATE NOT NULL,
  signal TEXT NOT NULL,
  value BIGINT NOT NULL,
  baseline_mean NUMERIC(12,2) NOT NULL,
  baseline_std NUMERIC(12,2) NOT NULL,
  pct_over_baseline NUMERIC(8,2) NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (series_id, detected_date, signal)
);

CREATE INDEX IF NOT EXISTS idx_series_breakouts_recent ON series_breakouts(detected_date DESC);
CREATE INDEX IF NOT EXISTS idx_series_breakouts_series ON series_breakouts(series_id, detected_date DESC);

ALTER TABLE series_breakouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read on series_breakouts" ON series_breakouts;
CREATE POLICY "Allow public read on series_breakouts" ON series_breakouts FOR SELECT USING (true);

-- Daily Challenges Table
CREATE TABLE IF NOT EXISTS daily_challenges (
  date DATE PRIMARY KEY,
  series_ids UUID[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE daily_challenges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read on daily_challenges" ON daily_challenges;
CREATE POLICY "Allow public read on daily_challenges" ON daily_challenges FOR SELECT USING (true);

-- User Profiles Table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  current_streak INT NOT NULL DEFAULT 0,
  best_streak INT NOT NULL DEFAULT 0,
  last_played_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT username_format CHECK (username ~ '^[a-z0-9_]{3,20}$'),
  CONSTRAINT profiles_username_not_blocked CHECK (lower(username) NOT IN (
    'admin', 'administrator', 'help', 'moderator', 'mod', 'official', 'owner',
    'root', 'security', 'staff', 'support', 'system', 'tv_arena', 'tvarena',
    'verified', 'nigger', 'nigga', 'faggot', 'tranny', 'retard', 'kike',
    'spic', 'chink', 'coon', 'wetback'
  ))
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read on profiles" ON profiles;
CREATE POLICY "Allow public read on profiles" ON profiles FOR SELECT USING (true);

REVOKE UPDATE ON profiles FROM authenticated;
GRANT UPDATE (username, display_name) ON profiles TO authenticated;

DROP POLICY IF EXISTS "Allow users update own profile" ON profiles;
CREATE POLICY "Allow users update own profile" ON profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Allow users insert own profile" ON profiles;
CREATE POLICY "Allow users insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Signed-in users can save shows to a private, user-owned watchlist.
CREATE TABLE IF NOT EXISTS user_watchlist (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, series_id)
);

CREATE INDEX IF NOT EXISTS user_watchlist_user_created_idx
  ON user_watchlist (user_id, created_at DESC);

ALTER TABLE user_watchlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON user_watchlist FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON user_watchlist TO authenticated;

DROP POLICY IF EXISTS "Users can read own watchlist" ON user_watchlist;
CREATE POLICY "Users can read own watchlist"
  ON user_watchlist
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can add to own watchlist" ON user_watchlist;
CREATE POLICY "Users can add to own watchlist"
  ON user_watchlist
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can remove from own watchlist" ON user_watchlist;
CREATE POLICY "Users can remove from own watchlist"
  ON user_watchlist
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Profile creation trigger on auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_name TEXT;
  clean_name TEXT;
  candidate TEXT;
BEGIN
  base_name := LOWER(SPLIT_PART(COALESCE(new.email, 'player'), '@', 1));
  clean_name := REGEXP_REPLACE(base_name, '[^a-z0-9_]', '', 'g');
  IF LENGTH(clean_name) < 3 THEN
    clean_name := 'player';
  END IF;
  clean_name := SUBSTRING(clean_name FROM 1 FOR 14);
  candidate := clean_name || '_' || SUBSTRING(REPLACE(new.id::text, '-', '') FROM 1 FOR 4);

  INSERT INTO public.profiles (id, username, display_name)
  VALUES (new.id, candidate, candidate)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- User Scores Table (Strict RLS: Only SELECT for users; NO direct client INSERT)
CREATE TABLE IF NOT EXISTS user_scores (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  score INT NOT NULL CHECK (score >= 0 AND score <= 10),
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  completed_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

ALTER TABLE user_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own scores" ON user_scores;
CREATE POLICY "Users can read own scores" ON user_scores FOR SELECT USING (auth.uid() = user_id);

-- Validated Daily Score Submission RPC
ALTER TABLE user_scores ADD COLUMN IF NOT EXISTS correctness BOOLEAN[];

CREATE OR REPLACE FUNCTION submit_daily_score(p_date DATE, p_answers JSONB)
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
  v_correctness BOOLEAN[] := ARRAY[]::BOOLEAN[];
  v_is_correct BOOLEAN;
  v_show_a_id UUID;
  v_show_b_id UUID;
  v_score_a BIGINT;
  v_score_b BIGINT;
  v_guess TEXT;
  v_deck_len INT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required to submit score'; END IF;
  IF p_date < v_yesterday OR p_date > v_today THEN
    RAISE EXCEPTION 'Score submissions are only accepted for today or yesterday UTC';
  END IF;
  SELECT series_ids INTO v_deck FROM daily_challenges WHERE date = p_date;
  IF v_deck IS NULL THEN RAISE EXCEPTION 'No challenge deck found for date %', p_date; END IF;
  v_deck_len := array_length(v_deck, 1);
  IF v_deck_len < 2 THEN RAISE EXCEPTION 'Challenge deck is incomplete'; END IF;
  IF jsonb_typeof(p_answers) <> 'array' OR jsonb_array_length(p_answers) <> v_deck_len - 1 THEN
    RAISE EXCEPTION 'p_answers must be a JSON array of % answers', v_deck_len - 1;
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(p_answers) AS submitted(answer)
    WHERE answer IS NULL OR answer NOT IN ('higher', 'lower')
  ) THEN
    RAISE EXCEPTION 'Each answer must be higher or lower';
  END IF;
  IF EXISTS (SELECT 1 FROM user_scores WHERE user_id = v_uid AND date = p_date) THEN
    RAISE EXCEPTION 'Score already submitted for this daily challenge';
  END IF;

  FOR i IN 0 .. LEAST(v_deck_len - 2, 9) LOOP
    v_show_a_id := v_deck[i + 1];
    v_show_b_id := v_deck[i + 2];
    v_guess := p_answers->>i;
    SELECT COALESCE(current_7d_score, 0) INTO v_score_a FROM series_leaderboard WHERE id = v_show_a_id;
    SELECT COALESCE(current_7d_score, 0) INTO v_score_b FROM series_leaderboard WHERE id = v_show_b_id;
    v_is_correct := COALESCE((v_guess = 'higher' AND v_score_b > v_score_a)
      OR (v_guess = 'lower' AND v_score_b < v_score_a), FALSE);
    v_correctness := array_append(v_correctness, v_is_correct);
    IF v_is_correct THEN v_calculated_score := v_calculated_score + 1; END IF;
  END LOOP;

  INSERT INTO user_scores (user_id, date, score, answers, correctness, completed_at)
  VALUES (v_uid, p_date, v_calculated_score, p_answers, v_correctness, now());
  UPDATE profiles
  SET current_streak = CASE
        WHEN last_played_date = p_date - INTERVAL '1 day' THEN current_streak + 1
        WHEN last_played_date = p_date THEN current_streak
        ELSE 1 END,
      best_streak = GREATEST(best_streak, CASE
        WHEN last_played_date = p_date - INTERVAL '1 day' THEN current_streak + 1 ELSE 1 END),
      last_played_date = p_date,
      updated_at = now()
  WHERE id = v_uid;
  RETURN jsonb_build_object('success', true, 'score', v_calculated_score, 'date', p_date);
END;
$$;

REVOKE EXECUTE ON FUNCTION submit_daily_score(DATE, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION submit_daily_score(DATE, JSONB) TO authenticated;

CREATE TABLE daily_score_shares (
  share_token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date),
  FOREIGN KEY (user_id, date) REFERENCES user_scores(user_id, date) ON DELETE CASCADE
);

ALTER TABLE daily_score_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own daily score shares"
  ON daily_score_shares FOR SELECT USING (auth.uid() = user_id);
GRANT SELECT ON daily_score_shares TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON daily_score_shares FROM anon, authenticated;

CREATE OR REPLACE FUNCTION create_daily_score_share(p_date DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_share_token UUID;
  v_score INT;
  v_correctness BOOLEAN[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required to create a score share'; END IF;
  SELECT score, correctness INTO v_score, v_correctness
  FROM user_scores WHERE user_id = v_uid AND date = p_date;
  IF NOT FOUND OR cardinality(v_correctness) <> 10 THEN
    RAISE EXCEPTION 'A server-verified 10-round score is required before sharing';
  END IF;

  INSERT INTO daily_score_shares (user_id, date) VALUES (v_uid, p_date)
  ON CONFLICT (user_id, date) DO NOTHING;
  SELECT share_token INTO v_share_token
  FROM daily_score_shares WHERE user_id = v_uid AND date = p_date;
  RETURN jsonb_build_object(
    'token', v_share_token,
    'date', p_date,
    'score', v_score,
    'correctness', to_jsonb(v_correctness)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION create_daily_score_share(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_daily_score_share(DATE) TO authenticated;

CREATE OR REPLACE FUNCTION get_daily_score_share(p_share_token UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'date', us.date,
    'score', us.score,
    'correctness', to_jsonb(us.correctness)
  )
  FROM daily_score_shares share
  JOIN user_scores us ON us.user_id = share.user_id AND us.date = share.date
  WHERE share.share_token = p_share_token AND us.correctness IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION get_daily_score_share(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_daily_score_share(UUID) TO anon, authenticated;

-- Safe Leaderboard RPCs (No emails exposed)
CREATE OR REPLACE FUNCTION daily_leaderboard(p_date DATE)
RETURNS TABLE (username TEXT, score INT, streak INT, rank BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.username,
    s.score,
    p.current_streak AS streak,
    ROW_NUMBER() OVER (ORDER BY s.score DESC, s.completed_at ASC) as rank
  FROM user_scores s
  JOIN profiles p ON s.user_id = p.id
  WHERE s.date = p_date
  ORDER BY s.score DESC, s.completed_at ASC
  LIMIT 20;
$$;

CREATE OR REPLACE FUNCTION streak_leaderboard()
RETURNS TABLE (username TEXT, score INT, streak INT, rank BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.username,
    p.best_streak AS score,
    p.current_streak AS streak,
    ROW_NUMBER() OVER (ORDER BY p.best_streak DESC, p.updated_at ASC) as rank
  FROM profiles p
  WHERE p.best_streak > 0
  ORDER BY p.best_streak DESC, p.updated_at ASC
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION daily_leaderboard(DATE) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION streak_leaderboard() TO anon, authenticated;

-- Operational Health and sync_runs Table
CREATE TABLE IF NOT EXISTS sync_runs (
  id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed')),
  shows_total INT DEFAULT 0,
  shows_updated INT DEFAULT 0,
  shows_failed INT DEFAULT 0,
  wiki_failures INT DEFAULT 0,
  reddit_failures INT DEFAULT 0,
  error_log TEXT,
  duration_ms INT
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_started ON sync_runs(started_at DESC);

ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read on sync_runs" ON sync_runs;
CREATE POLICY "Allow public read on sync_runs" ON sync_runs FOR SELECT USING (true);

-- Shared weekly mover rankings for the feed and prediction grading.
CREATE VIEW series_weekly_movers
WITH (security_invoker = on) AS
WITH periods AS (
  SELECT DISTINCT recorded_date AS period_start
  FROM series_daily_telemetry
  WHERE EXTRACT(ISODOW FROM recorded_date) = 1
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
    ) AS current_days,
    COUNT(DISTINCT t.recorded_date) FILTER (
      WHERE t.recorded_date >= w.period_start - 7 AND t.recorded_date < w.period_start
    ) AS previous_days
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
  WHERE ws.current_days = 7 AND ws.previous_days = 7 AND ws.previous_7d_score > 0
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

CREATE TABLE mover_predictions (
  week_start DATE NOT NULL CHECK (EXTRACT(ISODOW FROM week_start) = 1),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  points BIGINT CHECK (points IS NULL OR points IN (0, 1, 3)),
  actual_rank BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  graded_at TIMESTAMPTZ,
  PRIMARY KEY (week_start, user_id),
  CHECK ((graded_at IS NULL AND points IS NULL AND actual_rank IS NULL)
      OR (graded_at IS NOT NULL AND points IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_mover_predictions_user_id ON mover_predictions(user_id);

ALTER TABLE mover_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own mover predictions"
  ON mover_predictions FOR SELECT USING (auth.uid() = user_id);
GRANT SELECT ON mover_predictions TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON mover_predictions FROM anon, authenticated;

CREATE FUNCTION submit_mover_prediction(p_week_start DATE, p_series_id UUID)
RETURNS mover_predictions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_next_week DATE := date_trunc('week', (now() AT TIME ZONE 'UTC'))::DATE + 7;
  v_prediction mover_predictions;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to submit a mover prediction';
  END IF;
  IF p_week_start <> v_next_week THEN
    RAISE EXCEPTION 'Predictions are accepted only for next week starting %', v_next_week;
  END IF;
  IF EXISTS (
    SELECT 1 FROM mover_predictions
    WHERE week_start = p_week_start AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'A prediction has already been locked in for this week';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM series_daily_telemetry t
    WHERE t.series_id = p_series_id AND t.recorded_date < p_week_start
    GROUP BY t.series_id HAVING COUNT(DISTINCT t.recorded_date) >= 7
  ) THEN
    RAISE EXCEPTION 'Show must have at least seven days of telemetry before prediction week';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM series_daily_telemetry t
    JOIN series_daily_scores d ON d.telemetry_id = t.id
    WHERE t.series_id = p_series_id
      AND t.recorded_date >= p_week_start - 14
      AND t.recorded_date < p_week_start
    GROUP BY t.series_id
    HAVING SUM(d.daily_score) > 0
  ) THEN
    RAISE EXCEPTION 'Show must have a positive prior-week score to be eligible for mover ranking';
  END IF;

  INSERT INTO mover_predictions (week_start, user_id, series_id)
  VALUES (p_week_start, v_user_id, p_series_id)
  RETURNING * INTO v_prediction;
  RETURN v_prediction;
END;
$$;

REVOKE EXECUTE ON FUNCTION submit_mover_prediction(DATE, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION submit_mover_prediction(DATE, UUID) TO authenticated;

CREATE FUNCTION grade_mover_predictions_after_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_date DATE;
BEGIN
  IF NEW.status <> 'success' OR OLD.status = 'success' THEN
    RETURN NEW;
  END IF;
  SELECT MAX(recorded_date) INTO v_max_date FROM series_daily_telemetry;
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

REVOKE EXECUTE ON FUNCTION grade_mover_predictions_after_sync() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER grade_mover_predictions_after_successful_sync
  AFTER UPDATE OF status ON sync_runs
  FOR EACH ROW
  WHEN (NEW.status = 'success' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION grade_mover_predictions_after_sync();
