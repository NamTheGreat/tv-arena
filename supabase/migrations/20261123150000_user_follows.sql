-- Social follows, privacy-aware game stats and friends leaderboard (#192).
-- Rollback (in order): drop functions friends_leaderboard, head_to_head, get_profile_stats, can_view_stats;
--   restore daily_leaderboard/streak_leaderboard from 20261023020000; DROP TABLE user_follows;
--   GRANT SELECT ON profiles TO anon, authenticated; ALTER TABLE profiles DROP COLUMN stats_visibility.
-- Deploy note: streak columns on profiles stop being directly selectable; read them through get_profile_stats().
BEGIN;

SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';

-- 1. Privacy setting + column-level protection of game stats ------------------------------
ALTER TABLE public.profiles
  ADD COLUMN stats_visibility TEXT NOT NULL DEFAULT 'public'
  CONSTRAINT profiles_stats_visibility_check CHECK (stats_visibility IN ('public', 'followers'));

-- Streak columns are no longer directly readable; they are served by privacy-aware functions below.
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, username, display_name, created_at, updated_at, stats_visibility)
  ON public.profiles TO anon, authenticated;
GRANT UPDATE (username, display_name, stats_visibility) ON public.profiles TO authenticated;

-- Maintain the leaderboard tie-break timestamp without granting clients write access to it.
CREATE FUNCTION public.profiles_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_updated_at_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_set_updated_at();

-- 2. Follows ----------------------------------------------------------------------------------
CREATE TABLE public.user_follows (
  follower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  followee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'accepted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CONSTRAINT user_follows_no_self_follow CHECK (follower_id <> followee_id),
  CONSTRAINT user_follows_status_check CHECK (status IN ('pending', 'accepted'))
);

CREATE INDEX user_follows_followee_idx ON public.user_follows (followee_id, status);

CREATE FUNCTION public.user_follows_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_visibility TEXT;
BEGIN
  IF (SELECT COUNT(*) FROM public.user_follows WHERE follower_id = NEW.follower_id) >= 200 THEN
    RAISE EXCEPTION 'Follow limit reached' USING ERRCODE = 'P0001';
  END IF;
  -- Following a followers-only profile creates a request the owner must accept.
  SELECT stats_visibility INTO v_visibility FROM public.profiles WHERE id = NEW.followee_id;
  NEW.status := CASE WHEN v_visibility = 'followers' THEN 'pending' ELSE 'accepted' END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_follows_guard_trg
  BEFORE INSERT ON public.user_follows
  FOR EACH ROW EXECUTE FUNCTION public.user_follows_guard();

-- Switching a profile to public resolves its pending requests.
CREATE FUNCTION public.profiles_accept_pending_on_public()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stats_visibility = 'public' AND OLD.stats_visibility IS DISTINCT FROM 'public' THEN
    UPDATE public.user_follows SET status = 'accepted' WHERE followee_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_accept_pending_trg
  AFTER UPDATE OF stats_visibility ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_accept_pending_on_public();

REVOKE ALL ON FUNCTION public.profiles_accept_pending_on_public() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_follows FROM anon, authenticated;
GRANT SELECT, DELETE ON public.user_follows TO authenticated;
GRANT INSERT (follower_id, followee_id) ON public.user_follows TO authenticated;
GRANT UPDATE (status) ON public.user_follows TO authenticated;

CREATE POLICY "Users can read follows they are part of"
  ON public.user_follows FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IN (follower_id, followee_id));

CREATE POLICY "Users can follow as themselves"
  ON public.user_follows FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = follower_id);

CREATE POLICY "Owners can accept follow requests"
  ON public.user_follows FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = followee_id AND status = 'pending')
  WITH CHECK ((SELECT auth.uid()) = followee_id AND status = 'accepted');

CREATE POLICY "Either side can end a follow"
  ON public.user_follows FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) IN (follower_id, followee_id));

-- 3. Privacy-aware reads ----------------------------------------------------------------------
CREATE FUNCTION public.can_view_stats(p_owner UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    p_owner = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = p_owner AND stats_visibility = 'public')
    OR EXISTS (
      SELECT 1 FROM public.user_follows
      WHERE follower_id = auth.uid() AND followee_id = p_owner AND status = 'accepted'
    ),
    FALSE
  );
$$;

-- Streaks for a batch of users, honoring each owner's privacy setting.
CREATE FUNCTION public.get_profile_stats(p_user_ids UUID[])
RETURNS TABLE (user_id UUID, current_streak INT, best_streak INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.current_streak, p.best_streak
  FROM public.profiles p
  WHERE p.id = ANY (p_user_ids[1:100]) AND public.can_view_stats(p.id);
$$;

-- Public leaderboards now skip followers-only players the viewer is not allowed to see.
CREATE OR REPLACE FUNCTION public.daily_leaderboard(p_date DATE)
RETURNS TABLE (username TEXT, score INT, streak INT, rank BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.username,
    s.score,
    p.current_streak AS streak,
    ROW_NUMBER() OVER (ORDER BY s.score DESC, s.completed_at ASC) as rank
  FROM user_scores s
  JOIN profiles p ON s.user_id = p.id
  WHERE s.date = p_date AND public.can_view_stats(p.id)
  ORDER BY s.score DESC, s.completed_at ASC
  LIMIT 20;
$$;

CREATE OR REPLACE FUNCTION public.streak_leaderboard()
RETURNS TABLE (username TEXT, score INT, streak INT, rank BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.username,
    p.best_streak AS score,
    p.current_streak AS streak,
    ROW_NUMBER() OVER (ORDER BY p.best_streak DESC, p.updated_at ASC) as rank
  FROM profiles p
  WHERE p.best_streak > 0 AND public.can_view_stats(p.id)
  ORDER BY p.best_streak DESC, p.updated_at ASC
  LIMIT 20;
$$;

-- 4. Friends leaderboard and head-to-head -----------------------------------------------------
CREATE FUNCTION public.friends_leaderboard(p_date DATE)
RETURNS TABLE (
  user_id UUID, username TEXT, display_name TEXT, score INT,
  current_streak INT, best_streak INT, daily_rank BIGINT, streak_rank BIGINT,
  is_self BOOLEAN, is_mutual BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  RETURN QUERY
  WITH circle AS (
    SELECT v_uid AS uid, TRUE AS is_self, FALSE AS is_mutual
    UNION ALL
    SELECT f.followee_id, FALSE,
      EXISTS (
        SELECT 1 FROM public.user_follows b
        WHERE b.follower_id = f.followee_id AND b.followee_id = f.follower_id AND b.status = 'accepted'
      )
    FROM public.user_follows f
    WHERE f.follower_id = v_uid AND f.status = 'accepted'
  ), joined AS (
    SELECT c.uid, c.is_self, c.is_mutual, p.username, p.display_name, p.current_streak, p.best_streak,
           us.score, us.completed_at
    FROM circle c
    JOIN public.profiles p ON p.id = c.uid
    LEFT JOIN public.user_scores us ON us.user_id = c.uid AND us.date = p_date
  )
  SELECT
    j.uid, j.username, j.display_name, j.score, j.current_streak, j.best_streak,
    CASE WHEN j.score IS NULL THEN NULL
         ELSE ROW_NUMBER() OVER (PARTITION BY (j.score IS NOT NULL)
                                 ORDER BY j.score DESC, j.completed_at ASC, j.username ASC) END,
    ROW_NUMBER() OVER (ORDER BY j.current_streak DESC, j.best_streak DESC, j.username ASC),
    j.is_self, j.is_mutual
  FROM joined j
  ORDER BY 7 NULLS LAST, 1;
END;
$$;

CREATE FUNCTION public.head_to_head(p_username TEXT, p_date DATE)
RETURNS TABLE (
  opponent_id UUID, opponent_username TEXT, visible BOOLEAN,
  my_current_streak INT, my_best_streak INT, their_current_streak INT, their_best_streak INT,
  my_score_today INT, their_score_today INT,
  shared_days BIGINT, my_wins BIGINT, their_wins BIGINT, ties BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_opp public.profiles%ROWTYPE;
  v_me public.profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT * INTO v_opp FROM public.profiles WHERE username = lower(btrim(p_username));
  IF NOT FOUND OR v_opp.id = v_uid THEN
    RETURN;
  END IF;
  SELECT * INTO v_me FROM public.profiles WHERE id = v_uid;

  IF NOT public.can_view_stats(v_opp.id) THEN
    RETURN QUERY SELECT v_opp.id, v_opp.username, FALSE, v_me.current_streak, v_me.best_streak,
      NULL::INT, NULL::INT, NULL::INT, NULL::INT, NULL::BIGINT, NULL::BIGINT, NULL::BIGINT, NULL::BIGINT;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT v_opp.id, v_opp.username, TRUE,
    v_me.current_streak, v_me.best_streak, v_opp.current_streak, v_opp.best_streak,
    (SELECT score FROM public.user_scores WHERE user_id = v_uid AND date = p_date),
    (SELECT score FROM public.user_scores WHERE user_id = v_opp.id AND date = p_date),
    COUNT(*), COUNT(*) FILTER (WHERE a.score > b.score), COUNT(*) FILTER (WHERE a.score < b.score),
    COUNT(*) FILTER (WHERE a.score = b.score)
  FROM public.user_scores a
  JOIN public.user_scores b ON b.date = a.date AND b.user_id = v_opp.id
  WHERE a.user_id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.can_view_stats(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_profile_stats(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_stats(UUID[]) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.friends_leaderboard(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.friends_leaderboard(DATE) TO authenticated;
REVOKE ALL ON FUNCTION public.head_to_head(TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.head_to_head(TEXT, DATE) TO authenticated;

COMMIT;
