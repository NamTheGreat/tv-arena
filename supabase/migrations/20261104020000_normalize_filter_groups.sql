BEGIN;

ALTER TABLE series
  ADD COLUMN IF NOT EXISTS network_group TEXT NOT NULL DEFAULT 'Other';

UPDATE series
SET network_group = CASE
  WHEN network ILIKE '%netflix%' THEN 'Netflix'
  WHEN network ILIKE '%hbo%' OR lower(network) = 'max' THEN 'HBO'
  WHEN network ILIKE '%apple%' THEN 'Apple TV+'
  WHEN network ILIKE '%prime%' OR network ILIKE '%amazon%' THEN 'Prime Video'
  WHEN network ILIKE '%fx%' OR network ILIKE '%hulu%' THEN 'FX / Hulu'
  WHEN network ILIKE '%disney%' THEN 'Disney+'
  WHEN network ILIKE '%showtime%' OR network ILIKE '%paramount%' THEN 'Paramount+'
  WHEN network ILIKE '%peacock%' OR network ILIKE '%nbc%' THEN 'Peacock'
  ELSE 'Other'
END;

UPDATE series
SET genre_group = CASE
  WHEN genre_group ILIKE '%sci-fi%'
    OR genre_group ILIKE '%science fiction%'
    OR genre_group ILIKE '%fantasy%' THEN 'Drama & Sci-Fi'
  WHEN genre_group ILIKE '%comedy%' THEN 'Comedy & Drama'
  WHEN genre_group ILIKE '%crime%' OR genre_group ILIKE '%mystery%' THEN 'Crime & Mystery'
  ELSE 'Drama'
END;

-- squawk-ignore ban-replace-view-function
CREATE OR REPLACE VIEW series_leaderboard
WITH (security_invoker = on) AS
WITH anchor AS (
  SELECT COALESCE(MAX(recorded_date), CURRENT_DATE) AS max_date
  FROM series_daily_telemetry
),
daily_buckets AS (
  SELECT
    s.id AS series_id,
    s.tmdb_id,
    s.slug,
    s.title,
    s.network,
    s.network_group,
    s.genre_group,
    s.release_years,
    s.chart_color,
    COALESCE(SUM(CASE WHEN d.recorded_date > a.max_date - INTERVAL '7 days' AND d.recorded_date <= a.max_date THEN d.daily_score ELSE 0 END), 0)::BIGINT AS current_7d_score,
    COALESCE(SUM(CASE WHEN d.recorded_date > a.max_date - INTERVAL '14 days' AND d.recorded_date <= a.max_date - INTERVAL '7 days' THEN d.daily_score ELSE 0 END), 0)::BIGINT AS previous_7d_score
  FROM series s
  CROSS JOIN anchor a
  LEFT JOIN series_daily_scores d ON s.id = d.series_id
  GROUP BY s.id, s.tmdb_id, s.slug, s.title, s.network, s.network_group, s.genre_group, s.release_years, s.chart_color, a.max_date
)
SELECT
  series_id AS id,
  tmdb_id,
  slug,
  title,
  network,
  genre_group,
  release_years,
  chart_color,
  current_7d_score,
  current_7d_score AS buzz_score,
  previous_7d_score,
  CASE
    WHEN previous_7d_score > 0 THEN
      ROUND(((current_7d_score - previous_7d_score)::NUMERIC / previous_7d_score::NUMERIC) * 100, 2)
    ELSE NULL
  END AS delta_pct,
  ROW_NUMBER() OVER (ORDER BY current_7d_score DESC, title ASC) AS rank,
  network_group
FROM daily_buckets;

GRANT SELECT ON series_leaderboard TO anon, authenticated;

COMMIT;
