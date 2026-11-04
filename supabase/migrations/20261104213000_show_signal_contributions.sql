BEGIN;

SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';

CREATE VIEW series_signal_contributions
WITH (security_invoker = on) AS
WITH anchor AS (
  SELECT COALESCE(MAX(recorded_date), CURRENT_DATE) AS max_date
  FROM series_daily_telemetry
)
SELECT
  s.id AS series_id,
  COALESCE(SUM(COALESCE(t.wiki_views, 0) * w.wiki_weight), 0)::NUMERIC AS wiki_contribution,
  COALESCE(SUM(
    CASE WHEN t.reddit_observed AND (t.reddit_comments IS NOT NULL OR t.reddit_upvotes IS NOT NULL)
      THEN COALESCE(t.reddit_comments, 0) * w.comment_weight + COALESCE(t.reddit_upvotes, 0) * w.upvote_weight
      ELSE 0
    END
  ), 0)::NUMERIC AS reddit_contribution,
  COUNT(t.recorded_date)::BIGINT AS telemetry_days,
  COUNT(t.recorded_date) FILTER (
    WHERE t.reddit_observed AND (t.reddit_comments IS NOT NULL OR t.reddit_upvotes IS NOT NULL)
  )::BIGINT AS reddit_observed_days
FROM series s
CROSS JOIN anchor a
CROSS JOIN score_weights w
LEFT JOIN series_daily_telemetry t
  ON t.series_id = s.id
  AND t.recorded_date > a.max_date - INTERVAL '7 days'
  AND t.recorded_date <= a.max_date
WHERE w.id = 1
GROUP BY s.id, w.wiki_weight, w.comment_weight, w.upvote_weight;

GRANT SELECT ON series_signal_contributions TO anon, authenticated;

COMMIT;
