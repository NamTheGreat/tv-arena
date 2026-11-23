-- Show-level comment threads (#191).
-- Rollback: DROP TABLE public.series_comments; DROP FUNCTION public.series_comments_guard();
-- Moderation: set status = 'hidden' with the service role; hidden rows disappear from public reads.
-- Username blocklist is enforced by profiles (user_id references profiles), so blocked names cannot post.
BEGIN;

SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';

CREATE TABLE public.series_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.series(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT series_comments_status_check CHECK (status IN ('approved', 'hidden')),
  CONSTRAINT series_comments_body_length CHECK (char_length(btrim(body)) BETWEEN 1 AND 280),
  -- No control characters, no tag-like markup, no script URL schemes.
  CONSTRAINT series_comments_body_no_control_chars CHECK (body !~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  CONSTRAINT series_comments_body_no_markup CHECK (body !~ '<\s*[/!?a-zA-Z]'),
  CONSTRAINT series_comments_body_no_script_urls CHECK (body !~* '(javascript|vbscript|data)\s*:')
);

CREATE INDEX series_comments_series_created_idx
  ON public.series_comments (series_id, created_at DESC)
  WHERE status = 'approved';
CREATE INDEX series_comments_user_created_idx
  ON public.series_comments (user_id, created_at DESC);

CREATE FUNCTION public.series_comments_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Simple spam brake: at most 5 comments per user per minute.
    IF (SELECT COUNT(*) FROM public.series_comments
        WHERE user_id = NEW.user_id AND created_at > now() - INTERVAL '1 minute') >= 5 THEN
      RAISE EXCEPTION 'Too many comments, please wait a minute' USING ERRCODE = 'P0001';
    END IF;
    NEW.body := btrim(NEW.body);
  ELSE
    NEW.body := btrim(NEW.body);
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER series_comments_guard_trg
  BEFORE INSERT OR UPDATE OF body ON public.series_comments
  FOR EACH ROW EXECUTE FUNCTION public.series_comments_guard();

ALTER TABLE public.series_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.series_comments FROM anon, authenticated;
GRANT SELECT ON public.series_comments TO anon, authenticated;
GRANT INSERT (series_id, user_id, body) ON public.series_comments TO authenticated;
GRANT UPDATE (body) ON public.series_comments TO authenticated;
GRANT DELETE ON public.series_comments TO authenticated;

CREATE POLICY "Anyone can read approved comments"
  ON public.series_comments
  FOR SELECT TO anon, authenticated
  USING (status = 'approved');

CREATE POLICY "Users can post own comments"
  ON public.series_comments
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can edit own comments"
  ON public.series_comments
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id AND status = 'approved')
  WITH CHECK ((SELECT auth.uid()) = user_id AND status = 'approved');

CREATE POLICY "Users can delete own comments"
  ON public.series_comments
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

COMMIT;
