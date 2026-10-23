-- Migration: Rename misleading viewer columns to buzz score and drop unused finale column
-- Safe, idempotent column renames and column cleanup

DO $$
BEGIN
  -- 1. Rename viewers_premiere_28d -> buzz_score on series table
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'series' AND column_name = 'viewers_premiere_28d'
  ) THEN
    ALTER TABLE series RENAME COLUMN viewers_premiere_28d TO buzz_score;
  END IF;

  -- 2. Drop unused viewers_finale on series table
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'series' AND column_name = 'viewers_finale'
  ) THEN
    ALTER TABLE series DROP COLUMN viewers_finale;
  END IF;

  -- 3. Rename daily_viewers -> daily_score on series_daily_telemetry table
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'series_daily_telemetry' AND column_name = 'daily_viewers'
  ) THEN
    ALTER TABLE series_daily_telemetry RENAME COLUMN daily_viewers TO daily_score;
  END IF;
END $$;
