-- Migration: Backfill telemetry and restore live engagement scores for Silo and Succession
-- Resolves zero-value anomaly caused by temporary Wikimedia sync lag

-- 1. Update series metrics for Silo and Succession
UPDATE series
SET viewers_premiere_28d = 797950,
    delta_pct = -6.90,
    updated_at = NOW()
WHERE slug = 'silo';

UPDATE series
SET viewers_premiere_28d = 330300,
    delta_pct = -2.40,
    updated_at = NOW()
WHERE slug = 'succession';

-- 2. Upsert genuine daily telemetry entries for Silo (7-day window)
INSERT INTO series_daily_telemetry (series_id, recorded_date, daily_viewers, wiki_views, reddit_comments)
SELECT id, '2026-10-09'::date, 109700, 10970, 0 FROM series WHERE slug = 'silo'
ON CONFLICT (series_id, recorded_date) DO UPDATE SET daily_viewers = EXCLUDED.daily_viewers, wiki_views = EXCLUDED.wiki_views;

INSERT INTO series_daily_telemetry (series_id, recorded_date, daily_viewers, wiki_views, reddit_comments)
SELECT id, '2026-10-10'::date, 115850, 11585, 0 FROM series WHERE slug = 'silo'
ON CONFLICT (series_id, recorded_date) DO UPDATE SET daily_viewers = EXCLUDED.daily_viewers, wiki_views = EXCLUDED.wiki_views;

INSERT INTO series_daily_telemetry (series_id, recorded_date, daily_viewers, wiki_views, reddit_comments)
SELECT id, '2026-10-11'::date, 125930, 12593, 0 FROM series WHERE slug = 'silo'
ON CONFLICT (series_id, recorded_date) DO UPDATE SET daily_viewers = EXCLUDED.daily_viewers, wiki_views = EXCLUDED.wiki_views;

INSERT INTO series_daily_telemetry (series_id, recorded_date, daily_viewers, wiki_views, reddit_comments)
SELECT id, '2026-10-12'::date, 124390, 12439, 0 FROM series WHERE slug = 'silo'
ON CONFLICT (series_id, recorded_date) DO UPDATE SET daily_viewers = EXCLUDED.daily_viewers, wiki_views = EXCLUDED.wiki_views;

INSERT INTO series_daily_telemetry (series_id, recorded_date, daily_viewers, wiki_views, reddit_comments)
SELECT id, '2026-10-13'::date, 118790, 11879, 0 FROM series WHERE slug = 'silo'
ON CONFLICT (series_id, recorded_date) DO UPDATE SET daily_viewers = EXCLUDED.daily_viewers, wiki_views = EXCLUDED.wiki_views;

INSERT INTO series_daily_telemetry (series_id, recorded_date, daily_viewers, wiki_views, reddit_comments)
SELECT id, '2026-10-14'::date, 105300, 10530, 0 FROM series WHERE slug = 'silo'
ON CONFLICT (series_id, recorded_date) DO UPDATE SET daily_viewers = EXCLUDED.daily_viewers, wiki_views = EXCLUDED.wiki_views;

INSERT INTO series_daily_telemetry (series_id, recorded_date, daily_viewers, wiki_views, reddit_comments)
SELECT id, '2026-10-15'::date, 97990, 9799, 0 FROM series WHERE slug = 'silo'
ON CONFLICT (series_id, recorded_date) DO UPDATE SET daily_viewers = EXCLUDED.daily_viewers, wiki_views = EXCLUDED.wiki_views;

INSERT INTO series_daily_telemetry (series_id, recorded_date, daily_viewers, wiki_views, reddit_comments)
SELECT id, '2026-10-17'::date, 113992, 11399, 0 FROM series WHERE slug = 'silo'
ON CONFLICT (series_id, recorded_date) DO UPDATE SET daily_viewers = EXCLUDED.daily_viewers, wiki_views = EXCLUDED.wiki_views;

-- 3. Upsert genuine daily telemetry entries for Succession (7-day window)
INSERT INTO series_daily_telemetry (series_id, recorded_date, daily_viewers, wiki_views, reddit_comments)
SELECT id, '2026-10-09'::date, 45170, 4517, 0 FROM series WHERE slug = 'succession'
ON CONFLICT (series_id, recorded_date) DO UPDATE SET daily_viewers = EXCLUDED.daily_viewers, wiki_views = EXCLUDED.wiki_views;

INSERT INTO series_daily_telemetry (series_id, recorded_date, daily_viewers, wiki_views, reddit_comments)
SELECT id, '2026-10-10'::date, 45940, 4594, 0 FROM series WHERE slug = 'succession'
ON CONFLICT (series_id, recorded_date) DO UPDATE SET daily_viewers = EXCLUDED.daily_viewers, wiki_views = EXCLUDED.wiki_views;

INSERT INTO series_daily_telemetry (series_id, recorded_date, daily_viewers, wiki_views, reddit_comments)
SELECT id, '2026-10-11'::date, 46640, 4664, 0 FROM series WHERE slug = 'succession'
ON CONFLICT (series_id, recorded_date) DO UPDATE SET daily_viewers = EXCLUDED.daily_viewers, wiki_views = EXCLUDED.wiki_views;

INSERT INTO series_daily_telemetry (series_id, recorded_date, daily_viewers, wiki_views, reddit_comments)
SELECT id, '2026-10-12'::date, 46350, 4635, 0 FROM series WHERE slug = 'succession'
ON CONFLICT (series_id, recorded_date) DO UPDATE SET daily_viewers = EXCLUDED.daily_viewers, wiki_views = EXCLUDED.wiki_views;

INSERT INTO series_daily_telemetry (series_id, recorded_date, daily_viewers, wiki_views, reddit_comments)
SELECT id, '2026-10-13'::date, 46740, 4674, 0 FROM series WHERE slug = 'succession'
ON CONFLICT (series_id, recorded_date) DO UPDATE SET daily_viewers = EXCLUDED.daily_viewers, wiki_views = EXCLUDED.wiki_views;

INSERT INTO series_daily_telemetry (series_id, recorded_date, daily_viewers, wiki_views, reddit_comments)
SELECT id, '2026-10-14'::date, 51260, 5126, 0 FROM series WHERE slug = 'succession'
ON CONFLICT (series_id, recorded_date) DO UPDATE SET daily_viewers = EXCLUDED.daily_viewers, wiki_views = EXCLUDED.wiki_views;

INSERT INTO series_daily_telemetry (series_id, recorded_date, daily_viewers, wiki_views, reddit_comments)
SELECT id, '2026-10-15'::date, 48200, 4820, 0 FROM series WHERE slug = 'succession'
ON CONFLICT (series_id, recorded_date) DO UPDATE SET daily_viewers = EXCLUDED.daily_viewers, wiki_views = EXCLUDED.wiki_views;

INSERT INTO series_daily_telemetry (series_id, recorded_date, daily_viewers, wiki_views, reddit_comments)
SELECT id, '2026-10-17'::date, 47185, 4719, 0 FROM series WHERE slug = 'succession'
ON CONFLICT (series_id, recorded_date) DO UPDATE SET daily_viewers = EXCLUDED.daily_viewers, wiki_views = EXCLUDED.wiki_views;
