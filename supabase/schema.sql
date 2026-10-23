-- TV Arena Complete PostgreSQL Schema + Initial Seed Data
CREATE TABLE IF NOT EXISTS series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tmdb_id INT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  network TEXT NOT NULL,
  genre_group TEXT NOT NULL DEFAULT 'Drama & Sci-Fi',
  release_years TEXT NOT NULL DEFAULT '2024–2025',
  chart_color TEXT DEFAULT '#C66A3D',
  wiki_slug TEXT NOT NULL,
  reddit_query TEXT NOT NULL,
  buzz_score BIGINT DEFAULT 0,
  delta_pct NUMERIC(9,2) DEFAULT 0.0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_series_title_search ON series USING gin (to_tsvector('english', title));

CREATE TABLE IF NOT EXISTS series_daily_telemetry (
  id BIGSERIAL PRIMARY KEY,
  series_id UUID REFERENCES series(id) ON DELETE CASCADE,
  recorded_date DATE NOT NULL DEFAULT CURRENT_DATE,
  daily_score BIGINT NOT NULL,
  wiki_views INT DEFAULT 0,
  reddit_comments INT DEFAULT 0,
  reddit_upvotes INT DEFAULT 0,
  UNIQUE (series_id, recorded_date)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_series_date ON series_daily_telemetry(series_id, recorded_date DESC);

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
CREATE OR REPLACE VIEW series_daily_scores AS
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

CREATE OR REPLACE VIEW series_leaderboard AS
WITH ranked_daily AS (
  SELECT
    s.id AS series_id,
    s.tmdb_id,
    s.slug,
    s.title,
    s.network,
    s.genre_group,
    s.release_years,
    s.chart_color,
    d.recorded_date,
    d.daily_score,
    ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY d.recorded_date DESC) as day_rank
  FROM series s
  LEFT JOIN series_daily_scores d ON s.id = d.series_id
),
aggregated_scores AS (
  SELECT
    series_id,
    tmdb_id,
    slug,
    title,
    network,
    genre_group,
    release_years,
    chart_color,
    COALESCE(SUM(CASE WHEN day_rank BETWEEN 1 AND 7 THEN daily_score ELSE 0 END), 0)::BIGINT AS current_7d_score,
    COALESCE(SUM(CASE WHEN day_rank BETWEEN 8 AND 14 THEN daily_score ELSE 0 END), 0)::BIGINT AS previous_7d_score
  FROM ranked_daily
  GROUP BY series_id, tmdb_id, slug, title, network, genre_group, release_years, chart_color
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
  current_7d_score AS buzz_score,
  current_7d_score,
  previous_7d_score,
  CASE
    WHEN previous_7d_score > 0 THEN
      ROUND(((current_7d_score - previous_7d_score)::numeric / previous_7d_score::numeric) * 100, 2)
    ELSE 0.0
  END AS delta_pct
FROM aggregated_scores
ORDER BY current_7d_score DESC;

-- Enable public read-only access for the React frontend
ALTER TABLE series ENABLE ROW LEVEL SECURITY;
ALTER TABLE series_daily_telemetry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on series" ON series;
CREATE POLICY "Allow public read on series" ON series FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public read on telemetry" ON series_daily_telemetry;
CREATE POLICY "Allow public read on telemetry" ON series_daily_telemetry FOR SELECT USING (true);

-- Seed initial flagship shows with zeroed metrics ready for telemetry sync
INSERT INTO series (tmdb_id, slug, title, network, genre_group, release_years, chart_color, wiki_slug, reddit_query, buzz_score, delta_pct)
VALUES
  (66732, 'stranger-things', 'Stranger Things', 'Netflix', 'Drama & Sci-Fi', '2024–2025', '#C66A3D', 'Stranger_Things', '"Stranger Things" (Netflix OR episode OR season)', 0, 0.0),
  (119051, 'wednesday', 'Wednesday', 'Netflix', 'Drama & Sci-Fi', '2024–2025', '#5C828C', 'Wednesday_(TV_series)', '"Wednesday" (Netflix OR Jenna Ortega OR season)', 0, 0.0),
  (94997, 'house-of-the-dragon', 'House of the Dragon', 'HBO', 'Drama & Sci-Fi', '2024–2025', '#C59A44', 'House_of_the_Dragon', '"House of the Dragon" (HBO OR episode OR season)', 0, 0.0),
  (95396, 'severance', 'Severance', 'Apple TV+', 'Drama & Sci-Fi', '2024–2025', '#C66A3D', 'Severance_(TV_series)', '"Severance" (Apple OR Lumon OR episode)', 0, 0.0),
  (100088, 'the-last-of-us', 'The Last of Us', 'HBO', 'Drama & Sci-Fi', '2024–2025', '#886F99', 'The_Last_of_Us_(TV_series)', '"The Last of Us" (HBO OR Joel OR Ellie)', 0, 0.0),
  (136315, 'the-bear', 'The Bear', 'FX / Hulu', 'Comedy & Drama', '2024–2025', '#5C828C', 'The_Bear_(TV_series)', '"The Bear" (Hulu OR FX OR Carmy)', 0, 0.0),
  (91239, 'bridgerton', 'Bridgerton', 'Netflix', 'Drama', '2024–2025', '#6E8761', 'Bridgerton', '"Bridgerton" (Netflix OR season OR episode)', 0, 0.0),
  (111803, 'the-white-lotus', 'The White Lotus', 'HBO', 'Drama', '2024–2025', '#A65D67', 'The_White_Lotus', '"The White Lotus" (HBO OR episode OR finale)', 0, 0.0),
  (76479, 'the-boys', 'The Boys', 'Prime Video', 'Drama & Sci-Fi', '2024–2025', '#C59A44', 'The_Boys_(TV_series)', '"The Boys" (Prime OR Homelander OR episode)', 0, 0.0),
  (106379, 'fallout', 'Fallout', 'Prime Video', 'Drama & Sci-Fi', '2024–2025', '#6E8761', 'Fallout_(American_TV_series)', '"Fallout" (Prime OR Vault OR episode)', 0, 0.0),
  (76331, 'succession', 'Succession', 'HBO', 'Drama', '2023–2024', '#886F99', 'Succession_(TV_series)', '"Succession" (HBO OR Kendall OR Roy)', 0, 0.0),
  (125988, 'silo', 'Silo', 'Apple TV+', 'Drama & Sci-Fi', '2024–2025', '#5C828C', 'Silo_(TV_series)', '"Silo" (Apple OR Juliette OR episode)', 0, 0.0)
ON CONFLICT (tmdb_id) DO NOTHING;


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
  CONSTRAINT username_format CHECK (username ~ '^[a-z0-9_]{3,20}$')
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read on profiles" ON profiles;
CREATE POLICY "Allow public read on profiles" ON profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow users update own profile" ON profiles;
CREATE POLICY "Allow users update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Allow users insert own profile" ON profiles;
CREATE POLICY "Allow users insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

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
CREATE OR REPLACE FUNCTION submit_daily_score(p_date DATE, p_answers JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_deck UUID[];
  v_calculated_score INT := 0;
  v_today DATE := CURRENT_DATE;
  v_yesterday DATE := CURRENT_DATE - INTERVAL '1 day';
  i INT;
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

  IF EXISTS (
    SELECT 1 FROM user_scores
    WHERE user_id = v_uid AND date = p_date
  ) THEN
    RAISE EXCEPTION 'Score already submitted for this daily challenge';
  END IF;

  FOR i IN 0 .. (LEAST(v_deck_len - 2, 9)) LOOP
    v_show_a_id := v_deck[i + 1];
    v_show_b_id := v_deck[i + 2];
    v_guess := p_answers->>i;

    SELECT COALESCE(viewers_premiere_28d, 0) INTO v_score_a FROM series WHERE id = v_show_a_id;
    SELECT COALESCE(viewers_premiere_28d, 0) INTO v_score_b FROM series WHERE id = v_show_b_id;

    v_is_higher := v_score_b >= v_score_a;
    IF (v_guess = 'higher' AND v_is_higher) OR (v_guess = 'lower' AND NOT v_is_higher) THEN
      v_calculated_score := v_calculated_score + 1;
    END IF;
  END LOOP;

  INSERT INTO user_scores (user_id, date, score, answers, completed_at)
  VALUES (v_uid, p_date, v_calculated_score, p_answers, now());

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
