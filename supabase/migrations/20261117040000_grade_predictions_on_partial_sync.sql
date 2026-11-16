CREATE OR REPLACE FUNCTION grade_mover_predictions_after_sync()
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
DROP TRIGGER IF EXISTS grade_mover_predictions_after_successful_sync ON sync_runs;
CREATE TRIGGER grade_mover_predictions_after_successful_sync
  AFTER UPDATE OF status ON sync_runs
  FOR EACH ROW
  WHEN (NEW.status IN ('success', 'partial') AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION grade_mover_predictions_after_sync();
