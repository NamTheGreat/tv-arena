-- Preserve the distinction between an observed zero and an unavailable Reddit
-- observation. Existing values are retained; only future inserts may be NULL.
BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';

-- These drops are required so missing Reddit observations can be stored as NULL.
-- squawk-ignore ban-drop-default
ALTER TABLE series_daily_telemetry ALTER COLUMN reddit_comments DROP DEFAULT;
-- squawk-ignore ban-drop-not-null
ALTER TABLE series_daily_telemetry ALTER COLUMN reddit_comments DROP NOT NULL;
-- squawk-ignore ban-drop-default
ALTER TABLE series_daily_telemetry ALTER COLUMN reddit_upvotes DROP DEFAULT;
-- squawk-ignore ban-drop-not-null
ALTER TABLE series_daily_telemetry ALTER COLUMN reddit_upvotes DROP NOT NULL;

-- Existing historical metrics are treated as observed. The pipeline marks
-- carried values false so consumers can distinguish them from real zeros.
ALTER TABLE series_daily_telemetry
  ADD COLUMN IF NOT EXISTS reddit_observed BOOLEAN NOT NULL DEFAULT TRUE;

-- Keep the existing view name and column contract while deriving nullable inputs.
-- squawk-ignore ban-replace-view-function
CREATE OR REPLACE VIEW series_daily_scores
WITH (security_invoker = on) AS
SELECT
  t.id AS telemetry_id,
  t.series_id,
  t.recorded_date,
  t.wiki_views,
  t.reddit_comments,
  COALESCE(t.reddit_upvotes, 0) AS reddit_upvotes,
  ROUND(
    (t.wiki_views * w.wiki_weight) +
    (COALESCE(t.reddit_comments, 0) * w.comment_weight) +
    (COALESCE(t.reddit_upvotes, 0) * w.upvote_weight)
  )::BIGINT AS daily_score
FROM series_daily_telemetry t
CROSS JOIN (
  SELECT wiki_weight, comment_weight, upvote_weight
  FROM score_weights WHERE id = 1 LIMIT 1
) w;

GRANT SELECT ON series_daily_scores TO anon, authenticated;

COMMIT;
