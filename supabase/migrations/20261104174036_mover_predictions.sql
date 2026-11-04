-- Weekly mover predictions. A successful sync grades completed weeks once the
-- full Monday-Sunday telemetry window is available.
BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';

CREATE TABLE mover_predictions (
  week_start DATE NOT NULL CHECK (EXTRACT(ISODOW FROM week_start) = 1),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  points SMALLINT CHECK (points IS NULL OR points IN (0, 1, 3)),
  actual_rank BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  graded_at TIMESTAMPTZ,
  PRIMARY KEY (week_start, user_id),
  CHECK ((graded_at IS NULL AND points IS NULL AND actual_rank IS NULL)
      OR (graded_at IS NOT NULL AND points IS NOT NULL))
);

ALTER TABLE mover_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own mover predictions"
  ON mover_predictions FOR SELECT USING (auth.uid() = user_id);
GRANT SELECT ON mover_predictions TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON mover_predictions FROM anon, authenticated;

CREATE OR REPLACE FUNCTION submit_mover_prediction(p_week_start DATE, p_series_id UUID)
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
  IF NOT EXISTS (
    SELECT 1 FROM series_daily_telemetry t
    WHERE t.series_id = p_series_id AND t.recorded_date < p_week_start
    GROUP BY t.series_id HAVING COUNT(DISTINCT t.recorded_date) >= 7
  ) THEN
    RAISE EXCEPTION 'Show must have at least seven days of telemetry before prediction week';
  END IF;

  INSERT INTO mover_predictions (week_start, user_id, series_id)
  VALUES (p_week_start, v_user_id, p_series_id)
  RETURNING * INTO v_prediction;
  RETURN v_prediction;
END;
$$;

REVOKE EXECUTE ON FUNCTION submit_mover_prediction(DATE, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION submit_mover_prediction(DATE, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION grade_mover_predictions_after_sync()
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
  IF v_max_date IS NULL THEN
    RETURN NEW;
  END IF;

  WITH pending_weeks AS (
    SELECT DISTINCT p.week_start
    FROM mover_predictions p
    WHERE p.graded_at IS NULL AND p.week_start + 6 <= v_max_date
  ), ranked AS (
    SELECT
      m.period_start AS week_start,
      m.series_id,
      m.mover_rank AS actual_rank
    FROM series_weekly_movers m
    JOIN pending_weeks w ON w.week_start = m.period_start
  ), graded AS (
    SELECT
      p.week_start,
      p.user_id,
      r.actual_rank,
      CASE WHEN r.actual_rank = 1 THEN 3
           WHEN r.actual_rank <= 3 THEN 1
           ELSE 0 END::SMALLINT AS points
    FROM mover_predictions p
    LEFT JOIN ranked r ON r.week_start = p.week_start AND r.series_id = p.series_id
    WHERE p.graded_at IS NULL
      AND p.week_start + 6 <= v_max_date
      AND EXISTS (SELECT 1 FROM ranked any_rank WHERE any_rank.week_start = p.week_start)
  )
  UPDATE mover_predictions p
  SET points = g.points,
      actual_rank = g.actual_rank,
      graded_at = now()
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

COMMIT;
