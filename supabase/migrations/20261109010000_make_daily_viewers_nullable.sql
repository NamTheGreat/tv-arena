-- Migration: Make legacy daily_viewers column nullable with default 0 if it exists
-- Rollback:
--   DO $$ BEGIN
--     IF EXISTS (
--       SELECT 1 FROM information_schema.columns
--       WHERE table_schema = 'public' AND table_name = 'series_daily_telemetry' AND column_name = 'daily_viewers'
--     ) THEN
--       ALTER TABLE series_daily_telemetry ALTER COLUMN daily_viewers SET NOT NULL;
--       ALTER TABLE series_daily_telemetry ALTER COLUMN daily_viewers DROP DEFAULT;
--     END IF;
--   END $$;

BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'series_daily_telemetry' AND column_name = 'daily_viewers'
  ) THEN
    -- squawk-ignore ban-drop-not-null
    ALTER TABLE series_daily_telemetry ALTER COLUMN daily_viewers DROP NOT NULL;
    -- squawk-ignore ban-drop-default
    ALTER TABLE series_daily_telemetry ALTER COLUMN daily_viewers SET DEFAULT 0;
  END IF;
END $$;

COMMIT;
