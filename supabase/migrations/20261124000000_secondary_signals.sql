-- Secondary signals: social mention volume and episode-level IMDb ratings (#193).
-- Rollback: ALTER TABLE series_daily_telemetry DROP COLUMN social_mentions, DROP COLUMN imdb_rating,
--   DROP COLUMN imdb_votes, DROP COLUMN imdb_episode; ALTER TABLE series DROP COLUMN imdb_id;
-- Deploy: the pipeline retries without these columns if they do not exist yet, so order does not matter.
BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

-- Optional signals from X mention volume and episode-level IMDb ratings. All nullable: a
-- NULL means "not observed", never zero. Core scores (series_daily_scores) are unchanged.
ALTER TABLE public.series_daily_telemetry
  ADD COLUMN social_mentions INT,
  ADD COLUMN imdb_rating NUMERIC(3, 1),
  ADD COLUMN imdb_votes INT,
  ADD COLUMN imdb_episode TEXT,
  ADD CONSTRAINT telemetry_social_mentions_nonneg CHECK (social_mentions IS NULL OR social_mentions >= 0),
  ADD CONSTRAINT telemetry_imdb_rating_range CHECK (imdb_rating IS NULL OR imdb_rating BETWEEN 1 AND 10),
  ADD CONSTRAINT telemetry_imdb_votes_nonneg CHECK (imdb_votes IS NULL OR imdb_votes >= 0),
  ADD CONSTRAINT telemetry_imdb_episode_format CHECK (imdb_episode IS NULL OR imdb_episode ~ '^S[0-9]{2,3}E[0-9]{2,4}$');

-- Cached IMDb id (resolved from TMDb by the pipeline) used to query ratings.
ALTER TABLE public.series
  ADD COLUMN imdb_id TEXT,
  ADD CONSTRAINT series_imdb_id_format CHECK (imdb_id IS NULL OR imdb_id ~ '^tt[0-9]{7,10}$');

COMMIT;
