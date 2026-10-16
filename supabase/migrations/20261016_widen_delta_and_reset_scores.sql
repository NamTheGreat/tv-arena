-- Migration: Widen delta_pct to prevent NUMERIC(5,2) overflow and reset fake seed numbers to zero
-- Run this migration if you previously executed the legacy schema.sql containing fabricated viewership numbers.

ALTER TABLE series ALTER COLUMN delta_pct TYPE NUMERIC(9,2);

UPDATE series
SET viewers_premiere_28d = 0,
    viewers_finale = 0,
    delta_pct = 0.0;
