-- Persist the server-verified daily grid and expose opt-in, tokenized share cards.
BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';

ALTER TABLE user_scores ADD COLUMN correctness BOOLEAN[];

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

-- Persist the exact comparison grid while the server scores submitted answers.
-- squawk-ignore ban-replace-view-function
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

COMMIT;
