BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';

CREATE INDEX IF NOT EXISTS idx_mover_predictions_user_id ON mover_predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_recorded_date ON series_daily_telemetry(recorded_date DESC);

COMMIT;
