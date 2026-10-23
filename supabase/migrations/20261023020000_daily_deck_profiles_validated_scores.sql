-- Migration: Daily Deck in Database, User Profiles, Validated Scores, and Security Definer RPCs

-- 1. Daily Challenges Table
CREATE TABLE IF NOT EXISTS daily_challenges (
  date DATE PRIMARY KEY,
  series_ids UUID[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE daily_challenges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read on daily_challenges" ON daily_challenges;
CREATE POLICY "Allow public read on daily_challenges" ON daily_challenges FOR SELECT USING (true);

-- 2. User Profiles Table
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

-- 3. User Scores Table (Strict RLS: Only SELECT for users; NO direct client INSERT)
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

-- 4. Validated Daily Score Submission RPC
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

  -- Accepts only today or yesterday UTC
  IF p_date < v_yesterday OR p_date > v_today THEN
    RAISE EXCEPTION 'Score submissions are only accepted for today or yesterday UTC';
  END IF;

  -- Load deck for date
  SELECT series_ids INTO v_deck FROM daily_challenges WHERE date = p_date;
  IF v_deck IS NULL THEN
    RAISE EXCEPTION 'No challenge deck found for date %', p_date;
  END IF;

  v_deck_len := array_length(v_deck, 1);
  IF v_deck_len < 2 THEN
    RAISE EXCEPTION 'Challenge deck is incomplete';
  END IF;

  -- Check if user already submitted for this date
  IF EXISTS (
    SELECT 1 FROM user_scores 
    WHERE user_id = v_uid AND date = p_date
  ) THEN
    RAISE EXCEPTION 'Score already submitted for this daily challenge';
  END IF;

  -- Validate and score answers (deck of 11 series = 10 rounds)
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

-- 5. Safe Leaderboard RPCs (No emails exposed)
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
