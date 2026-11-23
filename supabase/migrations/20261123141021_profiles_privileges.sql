-- Remove inherited table-level profile privileges while preserving the explicitly
-- granted column privileges established by the social privacy migration.
BEGIN;

SET LOCAL lock_timeout = '2s';

REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, username, display_name, created_at, updated_at, stats_visibility)
  ON public.profiles TO anon, authenticated;
GRANT UPDATE (username, display_name, stats_visibility) ON public.profiles TO authenticated;

COMMIT;
