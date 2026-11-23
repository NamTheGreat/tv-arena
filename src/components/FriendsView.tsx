import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { getTodayDateString } from '../lib/dailyChallenge';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  FollowRow,
  FriendEntry,
  FriendsTab,
  HeadToHead,
  StatsVisibility,
  acceptRequest,
  compareStreaks,
  declineRequest,
  fetchFollowing,
  fetchFriendsLeaderboard,
  fetchHeadToHead,
  fetchIncomingRequests,
  fetchStatsVisibility,
  followUser,
  setStatsVisibility,
  sortFriends,
  unfollow,
} from '../lib/follows';

interface FriendsViewProps {
  onOpenAuth?: () => void;
}

const name = (p: { username: string; display_name?: string | null }) => p.display_name?.trim() || `@${p.username}`;

export function FriendsView({ onOpenAuth }: FriendsViewProps) {
  const { user } = useAuth();
  const [board, setBoard] = useState<FriendEntry[]>([]);
  const [following, setFollowing] = useState<FollowRow[]>([]);
  const [requests, setRequests] = useState<FollowRow[]>([]);
  const [visibility, setVisibility] = useState<StatsVisibility>('public');
  const [tab, setTab] = useState<FriendsTab>('daily');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState('');
  const [h2h, setH2h] = useState<HeadToHead | null>(null);
  const [h2hLoading, setH2hLoading] = useState(false);
  const today = getTodayDateString();

  useEffect(() => {
    document.title = 'Friends | TV Arena';
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const [b, f, r, v] = await Promise.all([
        fetchFriendsLeaderboard(today),
        fetchFollowing(user.id),
        fetchIncomingRequests(user.id),
        fetchStatsVisibility(user.id),
      ]);
      setBoard(b);
      setFollowing(f);
      setRequests(r);
      setVisibility(v);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your friends.');
    } finally {
      setLoading(false);
    }
  }, [user, today]);

  useEffect(() => {
    if (!user || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh();
  }, [user, refresh]);

  const run = async (action: () => Promise<string | void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const message = await action();
      if (message) setNotice(message);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (!isSupabaseConfigured) {
    return <p role="alert" className="text-sm text-stone-600">Friends need a live database connection.</p>;
  }

  if (!user) {
    return (
      <div className="space-y-2">
        <h1 className="font-serif text-3xl text-arena-charcoal">Friends</h1>
        <p className="text-sm text-stone-600">
          <button type="button" onClick={onOpenAuth} className="font-semibold text-arena-terracotta underline">Sign in</button>{' '}
          to follow players and compare daily scores and streaks.
        </p>
      </div>
    );
  }

  const rows = sortFriends(board, tab);
  const accepted = following.filter((f) => f.status === 'accepted');
  const pendingOut = following.filter((f) => f.status === 'pending');

  const compare = async (target: string) => {
    setH2hLoading(true);
    setError(null);
    try {
      setH2h(await fetchHeadToHead(target, today));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not compare.');
    } finally {
      setH2hLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl text-arena-charcoal">Friends</h1>
        <p className="mt-1 text-sm text-stone-600">Follow players to see how your daily scores and streaks stack up.</p>
      </header>

      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
      {notice && <p role="status" className="text-xs text-emerald-800">{notice}</p>}

      <section aria-labelledby="friends-board" className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="friends-board" className="font-serif text-xl text-arena-charcoal">Friends leaderboard</h2>
          <div role="group" aria-label="Leaderboard view" className="inline-flex rounded-full border border-stone-200 p-0.5 text-xs">
            {(['daily', 'streak'] as FriendsTab[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
                className={`rounded-full px-3 py-1 font-semibold ${tab === key ? 'bg-arena-terracotta text-white' : 'text-stone-700'}`}
              >
                {key === 'daily' ? 'Today' : 'Streaks'}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <p role="status" className="text-xs text-stone-500">Loading…</p>
        ) : rows.length <= 1 ? (
          <p className="text-xs text-stone-500">Follow a player below to start your friends board.</p>
        ) : (
          <ol className="divide-y divide-stone-100">
            {rows.map((row, index) => (
              <li key={row.user_id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-6 text-xs text-stone-500">{tab === 'daily' ? (row.daily_rank ?? '–') : index + 1}</span>
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {name(row)}{row.is_self && <span className="ml-1 font-normal text-stone-500">(you)</span>}
                    </span>
                    <span className="text-[11px] text-stone-500">
                      {row.is_mutual ? 'Mutual · ' : ''}Streak {row.current_streak} · Best {row.best_streak}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold text-arena-charcoal">
                    {tab === 'daily' ? (row.score === null ? 'Not played' : `${row.score}/10`) : `${row.current_streak}d`}
                  </span>
                  {!row.is_self && (
                    <button type="button" className="text-[11px] text-stone-700 underline" onClick={() => compare(row.username)}>
                      Compare{' '}<span className="sr-only">with {row.username}</span>
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {(h2h || h2hLoading) && (
        <section aria-labelledby="h2h-heading" className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-6">
          <h2 id="h2h-heading" className="font-serif text-xl text-arena-charcoal">Head to head</h2>
          {h2hLoading && <p role="status" className="text-xs text-stone-500">Comparing…</p>}
          {h2h && !h2hLoading && <HeadToHeadCard data={h2h} />}
        </section>
      )}

      <section aria-labelledby="friends-add" className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-6">
        <h2 id="friends-add" className="mb-2 font-serif text-xl text-arena-charcoal">Follow a player</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const result = await followUser(user.id, username);
              setUsername('');
              return result === 'pending' ? 'Request sent. They need to approve it.' : 'You are now following them.';
            });
          }}
          className="flex gap-2"
        >
          <label htmlFor="follow-username" className="sr-only">Username</label>
          <input
            id="follow-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-2 text-sm"
          />
          <button type="submit" disabled={busy || !username.trim()} className="rounded-full bg-arena-terracotta px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
            Follow
          </button>
        </form>

        {requests.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-1 text-xs font-semibold text-stone-700">Requests to follow you</h3>
            <ul className="divide-y divide-stone-100">
              {requests.map((r) => (
                <li key={r.user_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>{name(r)}</span>
                  <span className="flex gap-3 text-xs">
                    <button type="button" disabled={busy} className="font-semibold text-emerald-800 underline" onClick={() => run(() => acceptRequest(user.id, r.user_id))}>Accept{' '}<span className="sr-only">{r.username}</span></button>
                    <button type="button" disabled={busy} className="text-rose-700 underline" onClick={() => run(() => declineRequest(user.id, r.user_id))}>Decline{' '}<span className="sr-only">{r.username}</span></button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4">
          <h3 className="mb-1 text-xs font-semibold text-stone-700">Following ({accepted.length})</h3>
          {accepted.length === 0 && pendingOut.length === 0 ? (
            <p className="text-xs text-stone-500">You are not following anyone yet.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {[...accepted, ...pendingOut].map((f) => (
                <li key={f.user_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>{name(f)}{f.status === 'pending' && <span className="ml-2 text-[11px] text-stone-500">(request pending)</span>}</span>
                  <button type="button" disabled={busy} className="text-xs text-stone-700 underline" onClick={() => run(() => unfollow(user.id, f.user_id))}>
                    {f.status === 'pending' ? 'Cancel' : 'Unfollow'}{' '}<span className="sr-only">{f.username}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="friends-privacy" className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-6">
        <h2 id="friends-privacy" className="mb-1 font-serif text-xl text-arena-charcoal">Privacy</h2>
        <p className="mb-3 text-xs text-stone-500">Choose who can see your streaks and daily scores on leaderboards and comparisons.</p>
        <label htmlFor="stats-visibility" className="sr-only">Who can see my game stats</label>
        <select
          id="stats-visibility"
          value={visibility}
          disabled={busy}
          onChange={(e) => {
            const next = e.target.value as StatsVisibility;
            void run(async () => {
              await setStatsVisibility(user.id, next);
              return next === 'followers' ? 'Only approved followers can see your stats now.' : 'Your stats are public. Pending requests were approved.';
            });
          }}
          className="rounded-xl border border-stone-200 px-3 py-2 text-sm"
        >
          <option value="public">Public: everyone can see my stats</option>
          <option value="followers">Followers only: approved followers can see my stats</option>
        </select>
      </section>
    </div>
  );
}

function HeadToHeadCard({ data }: { data: HeadToHead }) {
  if (!data.visible) {
    return <p className="text-xs text-stone-600">@{data.opponent_username} shares stats with approved followers only.</p>;
  }
  const verdict = compareStreaks(data.my_current_streak, data.their_current_streak ?? 0);
  return (
    <div className="mt-2 space-y-3 text-sm">
      <table className="w-full text-left text-xs">
        <caption className="sr-only">You versus @{data.opponent_username}</caption>
        <thead>
          <tr className="text-stone-500"><th scope="col" className="py-1 font-normal">Stat</th><th scope="col" className="font-normal">You</th><th scope="col" className="font-normal">@{data.opponent_username}</th></tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          <tr><th scope="row" className="py-1 font-normal">Current streak</th><td>{data.my_current_streak}</td><td>{data.their_current_streak}</td></tr>
          <tr><th scope="row" className="py-1 font-normal">Best streak</th><td>{data.my_best_streak}</td><td>{data.their_best_streak}</td></tr>
          <tr><th scope="row" className="py-1 font-normal">Today</th><td>{data.my_score_today ?? '–'}</td><td>{data.their_score_today ?? '–'}</td></tr>
        </tbody>
      </table>
      <p className="text-xs text-stone-700">
        {verdict === 'tied' ? 'You are level on current streak.' : verdict === 'you' ? 'You lead on current streak.' : `@${data.opponent_username} leads on current streak.`}
      </p>
      <p className="text-xs text-stone-700">
        {data.shared_days
          ? `Across ${data.shared_days} shared day${data.shared_days === 1 ? '' : 's'}: you won ${data.my_wins}, they won ${data.their_wins}, ${data.ties} tied.`
          : 'No shared daily challenges yet.'}
      </p>
    </div>
  );
}
