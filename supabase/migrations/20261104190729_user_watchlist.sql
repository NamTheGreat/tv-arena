BEGIN;

SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';

CREATE TABLE public.user_watchlist (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  series_id UUID NOT NULL REFERENCES public.series(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, series_id)
);

CREATE INDEX user_watchlist_user_created_idx
  ON public.user_watchlist (user_id, created_at DESC);

ALTER TABLE public.user_watchlist ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.user_watchlist FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.user_watchlist TO authenticated;

CREATE POLICY "Users can read own watchlist"
  ON public.user_watchlist
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can add to own watchlist"
  ON public.user_watchlist
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can remove from own watchlist"
  ON public.user_watchlist
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

COMMIT;
