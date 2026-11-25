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

-- Reject future-dated telemetry insertions and updates
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

GRANT SELECT ON series_signal_contributions TO anon, authenticated;

DROP VIEW IF EXISTS series_leaderboard CASCADE;

CREATE VIEW series_leaderboard 
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

GRANT SELECT ON series_deck_candidates TO anon, authenticated;

-- Aggregate recent 90-day telemetry as arrays to guarantee 1 row per show (bypasses 1,000-row PostgREST limits)
DROP VIEW IF EXISTS series_recent_telemetry CASCADE;

CREATE VIEW series_recent_telemetry 
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
  series_scores JSONB DEFAULT NULL,
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
  clean_name := SUBSTRING(clean_name FROM 1 FOR 11);
  candidate := clean_name || '_' || SUBSTRING(REPLACE(new.id::text, '-', '') FROM 1 FOR 8);

  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = candidate) LOOP
    candidate := SUBSTRING(clean_name FROM 1 FOR 11) || '_' || SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 8);
  END LOOP;

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
  v_series_scores JSONB;
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
  SELECT series_ids, series_scores INTO v_deck, v_series_scores FROM daily_challenges WHERE date = p_date;
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

    IF v_series_scores IS NOT NULL
       AND v_series_scores ? v_show_a_id::text
       AND v_series_scores ? v_show_b_id::text THEN
      v_score_a := COALESCE((v_series_scores->>v_show_a_id::text)::BIGINT, 0);
      v_score_b := COALESCE((v_series_scores->>v_show_b_id::text)::BIGINT, 0);
    ELSE
      SELECT COALESCE(current_7d_score, 0) INTO v_score_a FROM series_leaderboard WHERE id = v_show_a_id;
      SELECT COALESCE(current_7d_score, 0) INTO v_score_b FROM series_leaderboard WHERE id = v_show_b_id;
    END IF;

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

REVOKE EXECUTE ON FUNCTION grade_mover_predictions_after_sync() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER grade_mover_predictions_after_successful_sync
  AFTER UPDATE OF status ON sync_runs
  FOR EACH ROW
  WHEN (NEW.status IN ('success', 'partial') AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION grade_mover_predictions_after_sync();

-- Show-level comment threads (#191)
CREATE TABLE IF NOT EXISTS public.series_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.series(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT series_comments_status_check CHECK (status IN ('approved', 'hidden')),
  CONSTRAINT series_comments_body_length CHECK (char_length(btrim(body)) BETWEEN 1 AND 280),
  -- No control characters, no tag-like markup, no script URL schemes.
  CONSTRAINT series_comments_body_no_control_chars CHECK (body !~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  CONSTRAINT series_comments_body_no_markup CHECK (body !~ '<\s*[/!?a-zA-Z]'),
  CONSTRAINT series_comments_body_no_script_urls CHECK (body !~* '(javascript|vbscript|data)\s*:')
);

CREATE INDEX IF NOT EXISTS series_comments_series_created_idx
  ON public.series_comments (series_id, created_at DESC)
  WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS series_comments_user_created_idx
  ON public.series_comments (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.series_comments_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Simple spam brake: at most 5 comments per user per minute.
    IF (SELECT COUNT(*) FROM public.series_comments
        WHERE user_id = NEW.user_id AND created_at > now() - INTERVAL '1 minute') >= 5 THEN
      RAISE EXCEPTION 'Too many comments, please wait a minute' USING ERRCODE = 'P0001';
    END IF;
    NEW.body := btrim(NEW.body);
  ELSE
    NEW.body := btrim(NEW.body);
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS series_comments_guard_trg ON public.series_comments;
CREATE TRIGGER series_comments_guard_trg
  BEFORE INSERT OR UPDATE OF body ON public.series_comments
  FOR EACH ROW EXECUTE FUNCTION public.series_comments_guard();

ALTER TABLE public.series_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.series_comments FROM anon, authenticated;
GRANT SELECT ON public.series_comments TO anon, authenticated;
GRANT INSERT (series_id, user_id, body) ON public.series_comments TO authenticated;
GRANT UPDATE (body) ON public.series_comments TO authenticated;
GRANT DELETE ON public.series_comments TO authenticated;

DROP POLICY IF EXISTS "Anyone can read approved comments" ON public.series_comments;
CREATE POLICY "Anyone can read approved comments"
  ON public.series_comments
  FOR SELECT TO anon, authenticated
  USING (status = 'approved');

DROP POLICY IF EXISTS "Users can post own comments" ON public.series_comments;
CREATE POLICY "Users can post own comments"
  ON public.series_comments
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can edit own comments" ON public.series_comments;
CREATE POLICY "Users can edit own comments"
  ON public.series_comments
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id AND status = 'approved')
  WITH CHECK ((SELECT auth.uid()) = user_id AND status = 'approved');

DROP POLICY IF EXISTS "Users can delete own comments" ON public.series_comments;
CREATE POLICY "Users can delete own comments"
  ON public.series_comments
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);
-- All-time records and hall of fame (#190)
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

REVOKE ALL ON series_hall_of_fame FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON series_hall_of_fame TO anon, authenticated;

-- Social follows, privacy-aware game stats and friends leaderboard (#192)
-- 1. Privacy setting + column-level protection of game stats ------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stats_visibility TEXT NOT NULL DEFAULT 'public'
  CONSTRAINT profiles_stats_visibility_check CHECK (stats_visibility IN ('public', 'followers'));

-- Remove inherited table-level rights; restore only the columns clients may use.
REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, username, display_name, created_at, updated_at, stats_visibility)
  ON public.profiles TO anon, authenticated;
GRANT UPDATE (username, display_name, stats_visibility) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.profiles_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_updated_at_trg ON public.profiles;
CREATE TRIGGER profiles_set_updated_at_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_set_updated_at();
REVOKE ALL ON FUNCTION public.profiles_set_updated_at() FROM PUBLIC, anon, authenticated;

-- 2. Follows ----------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_follows (
  follower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  followee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'accepted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CONSTRAINT user_follows_no_self_follow CHECK (follower_id <> followee_id),
  CONSTRAINT user_follows_status_check CHECK (status IN ('pending', 'accepted'))
);

CREATE INDEX IF NOT EXISTS user_follows_followee_idx ON public.user_follows (followee_id, status);

CREATE OR REPLACE FUNCTION public.user_follows_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_visibility TEXT;
BEGIN
  IF (SELECT COUNT(*) FROM public.user_follows WHERE follower_id = NEW.follower_id) >= 200 THEN
    RAISE EXCEPTION 'Follow limit reached' USING ERRCODE = 'P0001';
  END IF;
  -- Following a followers-only profile creates a request the owner must accept.
  SELECT stats_visibility INTO v_visibility FROM public.profiles WHERE id = NEW.followee_id;
  NEW.status := CASE WHEN v_visibility = 'followers' THEN 'pending' ELSE 'accepted' END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_follows_guard_trg ON public.user_follows;
CREATE TRIGGER user_follows_guard_trg
  BEFORE INSERT ON public.user_follows
  FOR EACH ROW EXECUTE FUNCTION public.user_follows_guard();

-- Switching a profile to public resolves its pending requests.
CREATE OR REPLACE FUNCTION public.profiles_accept_pending_on_public()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stats_visibility = 'public' AND OLD.stats_visibility IS DISTINCT FROM 'public' THEN
    UPDATE public.user_follows SET status = 'accepted' WHERE followee_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_accept_pending_trg ON public.profiles;
CREATE TRIGGER profiles_accept_pending_trg
  AFTER UPDATE OF stats_visibility ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_accept_pending_on_public();

REVOKE ALL ON FUNCTION public.profiles_accept_pending_on_public() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_follows FROM anon, authenticated;
GRANT SELECT, DELETE ON public.user_follows TO authenticated;
GRANT INSERT (follower_id, followee_id) ON public.user_follows TO authenticated;
GRANT UPDATE (status) ON public.user_follows TO authenticated;

DROP POLICY IF EXISTS "Users can read follows they are part of" ON public.user_follows;
CREATE POLICY "Users can read follows they are part of"
  ON public.user_follows FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IN (follower_id, followee_id));

DROP POLICY IF EXISTS "Users can follow as themselves" ON public.user_follows;
CREATE POLICY "Users can follow as themselves"
  ON public.user_follows FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = follower_id);

DROP POLICY IF EXISTS "Owners can accept follow requests" ON public.user_follows;
CREATE POLICY "Owners can accept follow requests"
  ON public.user_follows FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = followee_id AND status = 'pending')
  WITH CHECK ((SELECT auth.uid()) = followee_id AND status = 'accepted');

DROP POLICY IF EXISTS "Either side can end a follow" ON public.user_follows;
CREATE POLICY "Either side can end a follow"
  ON public.user_follows FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) IN (follower_id, followee_id));

-- 3. Privacy-aware reads ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_stats(p_owner UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    p_owner = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = p_owner AND stats_visibility = 'public')
    OR EXISTS (
      SELECT 1 FROM public.user_follows
      WHERE follower_id = auth.uid() AND followee_id = p_owner AND status = 'accepted'
    ),
    FALSE
  );
$$;

-- Streaks for a batch of users, honoring each owner's privacy setting.
CREATE OR REPLACE FUNCTION public.get_profile_stats(p_user_ids UUID[])
RETURNS TABLE (user_id UUID, current_streak INT, best_streak INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.current_streak, p.best_streak
  FROM public.profiles p
  WHERE p.id = ANY (p_user_ids[1:100]) AND public.can_view_stats(p.id);
$$;

-- Public leaderboards now skip followers-only players the viewer is not allowed to see.
CREATE OR REPLACE FUNCTION public.daily_leaderboard(p_date DATE)
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
  WHERE s.date = p_date AND public.can_view_stats(p.id)
  ORDER BY s.score DESC, s.completed_at ASC
  LIMIT 20;
$$;

CREATE OR REPLACE FUNCTION public.streak_leaderboard()
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
  WHERE p.best_streak > 0 AND public.can_view_stats(p.id)
  ORDER BY p.best_streak DESC, p.updated_at ASC
  LIMIT 20;
$$;

-- 4. Friends leaderboard and head-to-head -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.friends_leaderboard(p_date DATE)
RETURNS TABLE (
  user_id UUID, username TEXT, display_name TEXT, score INT,
  current_streak INT, best_streak INT, daily_rank BIGINT, streak_rank BIGINT,
  is_self BOOLEAN, is_mutual BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  RETURN QUERY
  WITH circle AS (
    SELECT v_uid AS uid, TRUE AS is_self, FALSE AS is_mutual
    UNION ALL
    SELECT f.followee_id, FALSE,
      EXISTS (
        SELECT 1 FROM public.user_follows b
        WHERE b.follower_id = f.followee_id AND b.followee_id = f.follower_id AND b.status = 'accepted'
      )
    FROM public.user_follows f
    WHERE f.follower_id = v_uid AND f.status = 'accepted'
  ), joined AS (
    SELECT c.uid, c.is_self, c.is_mutual, p.username, p.display_name, p.current_streak, p.best_streak,
           us.score, us.completed_at
    FROM circle c
    JOIN public.profiles p ON p.id = c.uid
    LEFT JOIN public.user_scores us ON us.user_id = c.uid AND us.date = p_date
  )
  SELECT
    j.uid, j.username, j.display_name, j.score, j.current_streak, j.best_streak,
    CASE WHEN j.score IS NULL THEN NULL
         ELSE ROW_NUMBER() OVER (PARTITION BY (j.score IS NOT NULL)
                                 ORDER BY j.score DESC, j.completed_at ASC, j.username ASC) END,
    ROW_NUMBER() OVER (ORDER BY j.current_streak DESC, j.best_streak DESC, j.username ASC),
    j.is_self, j.is_mutual
  FROM joined j
  ORDER BY 7 NULLS LAST, 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.head_to_head(p_username TEXT, p_date DATE)
RETURNS TABLE (
  opponent_id UUID, opponent_username TEXT, visible BOOLEAN,
  my_current_streak INT, my_best_streak INT, their_current_streak INT, their_best_streak INT,
  my_score_today INT, their_score_today INT,
  shared_days BIGINT, my_wins BIGINT, their_wins BIGINT, ties BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_opp public.profiles%ROWTYPE;
  v_me public.profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT * INTO v_opp FROM public.profiles WHERE username = lower(btrim(p_username));
  IF NOT FOUND OR v_opp.id = v_uid THEN
    RETURN;
  END IF;
  SELECT * INTO v_me FROM public.profiles WHERE id = v_uid;

  IF NOT public.can_view_stats(v_opp.id) THEN
    RETURN QUERY SELECT v_opp.id, v_opp.username, FALSE, v_me.current_streak, v_me.best_streak,
      NULL::INT, NULL::INT, NULL::INT, NULL::INT, NULL::BIGINT, NULL::BIGINT, NULL::BIGINT, NULL::BIGINT;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT v_opp.id, v_opp.username, TRUE,
    v_me.current_streak, v_me.best_streak, v_opp.current_streak, v_opp.best_streak,
    (SELECT score FROM public.user_scores WHERE user_id = v_uid AND date = p_date),
    (SELECT score FROM public.user_scores WHERE user_id = v_opp.id AND date = p_date),
    COUNT(*), COUNT(*) FILTER (WHERE a.score > b.score), COUNT(*) FILTER (WHERE a.score < b.score),
    COUNT(*) FILTER (WHERE a.score = b.score)
  FROM public.user_scores a
  JOIN public.user_scores b ON b.date = a.date AND b.user_id = v_opp.id
  WHERE a.user_id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.can_view_stats(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_profile_stats(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_stats(UUID[]) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.friends_leaderboard(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.friends_leaderboard(DATE) TO authenticated;
REVOKE ALL ON FUNCTION public.head_to_head(TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.head_to_head(TEXT, DATE) TO authenticated;

-- Secondary signals (#193): nullable, NULL means "not observed". Core scores are unchanged.
ALTER TABLE public.series_daily_telemetry
  ADD COLUMN IF NOT EXISTS social_mentions INT,
  ADD COLUMN IF NOT EXISTS imdb_rating NUMERIC(3, 1),
  ADD COLUMN IF NOT EXISTS imdb_votes INT,
  ADD COLUMN IF NOT EXISTS imdb_episode TEXT;
ALTER TABLE public.series ADD COLUMN IF NOT EXISTS imdb_id TEXT;

ALTER TABLE public.series_daily_telemetry
  DROP CONSTRAINT IF EXISTS telemetry_social_mentions_nonneg,
  DROP CONSTRAINT IF EXISTS telemetry_imdb_rating_range,
  DROP CONSTRAINT IF EXISTS telemetry_imdb_votes_nonneg,
  DROP CONSTRAINT IF EXISTS telemetry_imdb_episode_format;
ALTER TABLE public.series_daily_telemetry
  ADD CONSTRAINT telemetry_social_mentions_nonneg CHECK (social_mentions IS NULL OR social_mentions >= 0),
  ADD CONSTRAINT telemetry_imdb_rating_range CHECK (imdb_rating IS NULL OR imdb_rating BETWEEN 1 AND 10),
  ADD CONSTRAINT telemetry_imdb_votes_nonneg CHECK (imdb_votes IS NULL OR imdb_votes >= 0),
  ADD CONSTRAINT telemetry_imdb_episode_format CHECK (imdb_episode IS NULL OR imdb_episode ~ '^S[0-9]{2,3}E[0-9]{2,4}$');
ALTER TABLE public.series DROP CONSTRAINT IF EXISTS series_imdb_id_format;
ALTER TABLE public.series
  ADD CONSTRAINT series_imdb_id_format CHECK (imdb_id IS NULL OR imdb_id ~ '^tt[0-9]{7,10}$');

-- Market insights: weekly platform share, genre engagement and signal points (#194)
-- Per show and week: average daily score over observed days (derived scores only).
-- Weeks are Monday based, bounded to the last 26 weeks, and a show needs at least 4 observed
-- days in the week to compete, so partial coverage cannot swing the macro numbers.
CREATE OR REPLACE VIEW insights_weekly_show_scores
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
CREATE OR REPLACE VIEW insights_platform_share_weekly
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
CREATE OR REPLACE VIEW insights_genre_share_weekly
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
CREATE OR REPLACE VIEW insights_signal_points
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

-- Premiere impact (#195): see migration 20261124020000_premiere_impact.sql
CREATE OR REPLACE VIEW series_premiere_impact
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
