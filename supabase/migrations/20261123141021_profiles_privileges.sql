-- Remove inherited table-level profile privileges while preserving the explicitly
-- granted column privileges established by the social privacy migration.
BEGIN;

SET LOCAL lock_timeout = '2s';

REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, username, display_name, created_at, updated_at, stats_visibility)
  ON public.profiles TO anon, authenticated;
GRANT UPDATE (username, display_name, stats_visibility) ON public.profiles TO authenticated;

-- Ensure robust username uniqueness in handle_new_user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_name TEXT;
  clean_name TEXT;
  candidate TEXT;
BEGIN
  base_name := LOWER(SPLIT_PART(COALESCE(new.email, 'player'), '@', 1));
  clean_name := REGEXP_REPLACE(base_name, '[^a-z0-9_]', '', 'g');
  IF LENGTH(clean_name) < 3 THEN
    clean_name := 'player';
  END IF;
  clean_name := SUBSTRING(clean_name FROM 1 FOR 11);
  candidate := clean_name || '_' || SUBSTRING(REPLACE(new.id::text, '-', '') FROM 1 FOR 8);

  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = candidate) LOOP
    candidate := SUBSTRING(clean_name FROM 1 FOR 11) || '_' || SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 8);
  END LOOP;

  INSERT INTO public.profiles (id, username, display_name)
  VALUES (new.id, candidate, candidate)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

COMMIT;
