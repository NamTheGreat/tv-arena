-- Migration: Raw Signals Storage, Score Weights Table, and Dynamic Score Views
-- Enables single-source-of-truth score calculations and live weight tuning

-- 1. Ensure reddit_upvotes column exists on series_daily_telemetry
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'series_daily_telemetry' AND column_name = 'reddit_upvotes'
  ) THEN
    ALTER TABLE series_daily_telemetry ADD COLUMN reddit_upvotes INT DEFAULT 0;
  END IF;
END $$;

-- 2. Table score_weights for formula parameters
CREATE TABLE IF NOT EXISTS score_weights (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  wiki_weight NUMERIC NOT NULL DEFAULT 10,
  comment_weight NUMERIC NOT NULL DEFAULT 150,
  upvote_weight NUMERIC NOT NULL DEFAULT 25,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE score_weights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read on score_weights" ON score_weights;
CREATE POLICY "Allow public read on score_weights" ON score_weights FOR SELECT USING (true);

INSERT INTO score_weights (id, wiki_weight, comment_weight, upvote_weight)
VALUES (1, 10, 150, 25)
ON CONFLICT (id) DO NOTHING;

-- 3. Dynamic Daily Scores View
CREATE OR REPLACE VIEW series_daily_scores AS
SELECT
  t.id AS telemetry_id,
  t.series_id,
  t.recorded_date,
  t.wiki_views,
  t.reddit_comments,
  COALESCE(t.reddit_upvotes, 0) AS reddit_upvotes,
  ROUND(
    (t.wiki_views * w.wiki_weight) +
    (t.reddit_comments * w.comment_weight) +
    (COALESCE(t.reddit_upvotes, 0) * w.upvote_weight)
  )::BIGINT AS daily_score
FROM series_daily_telemetry t
CROSS JOIN (SELECT wiki_weight, comment_weight, upvote_weight FROM score_weights WHERE id = 1 LIMIT 1) w;

-- 4. Dynamic Leaderboard View with Current 7D, Previous 7D, and delta_pct
CREATE OR REPLACE VIEW series_leaderboard AS
WITH ranked_daily AS (
  SELECT
    s.id AS series_id,
    s.tmdb_id,
    s.slug,
    s.title,
    s.network,
    s.genre_group,
    s.release_years,
    s.chart_color,
    d.recorded_date,
    d.daily_score,
    ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY d.recorded_date DESC) as day_rank
  FROM series s
  LEFT JOIN series_daily_scores d ON s.id = d.series_id
),
aggregated_scores AS (
  SELECT
    series_id,
    tmdb_id,
    slug,
    title,
    network,
    genre_group,
    release_years,
    chart_color,
    COALESCE(SUM(CASE WHEN day_rank BETWEEN 1 AND 7 THEN daily_score ELSE 0 END), 0)::BIGINT AS current_7d_score,
    COALESCE(SUM(CASE WHEN day_rank BETWEEN 8 AND 14 THEN daily_score ELSE 0 END), 0)::BIGINT AS previous_7d_score
  FROM ranked_daily
  GROUP BY series_id, tmdb_id, slug, title, network, genre_group, release_years, chart_color
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
  current_7d_score AS buzz_score,
  current_7d_score,
  previous_7d_score,
  CASE
    WHEN previous_7d_score > 0 THEN
      ROUND(((current_7d_score - previous_7d_score)::numeric / previous_7d_score::numeric) * 100, 2)
    ELSE 0.0
  END AS delta_pct
FROM aggregated_scores
ORDER BY current_7d_score DESC;
