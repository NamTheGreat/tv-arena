-- Migration: Freeze Daily Challenge Scores for Deterministic Grading
-- Adds series_scores JSONB to daily_challenges to store an immutable score snapshot
-- Updates submit_daily_score RPC to grade against the frozen snapshot with fallback to series_leaderboard

ALTER TABLE daily_challenges
ADD COLUMN IF NOT EXISTS series_scores JSONB DEFAULT NULL;

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
