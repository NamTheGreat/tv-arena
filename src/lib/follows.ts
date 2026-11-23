import { isSupabaseConfigured, supabase } from './supabase';

export type StatsVisibility = 'public' | 'followers';

export interface FriendEntry {
  user_id: string;
  username: string;
  display_name: string | null;
  score: number | null;
  current_streak: number;
  best_streak: number;
  daily_rank: number | null;
  streak_rank: number;
  is_self: boolean;
  is_mutual: boolean;
}

export interface HeadToHead {
  opponent_id: string;
  opponent_username: string;
  visible: boolean;
  my_current_streak: number;
  my_best_streak: number;
  their_current_streak: number | null;
  their_best_streak: number | null;
  my_score_today: number | null;
  their_score_today: number | null;
  shared_days: number | null;
  my_wins: number | null;
  their_wins: number | null;
  ties: number | null;
}

export interface FollowRow {
  user_id: string; // the other person
  username: string;
  display_name: string | null;
  status: 'pending' | 'accepted';
}

export type FriendsTab = 'daily' | 'streak';

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@/, '').toLowerCase();
}

export function isValidUsername(username: string): boolean {
  return /^[a-z0-9_]{3,20}$/.test(username);
}

/** Orders the friends board for a tab. Unplayed friends sit at the bottom of the daily view. */
export function sortFriends(entries: FriendEntry[], tab: FriendsTab): FriendEntry[] {
  const list = [...entries];
  if (tab === 'streak') return list.sort((a, b) => a.streak_rank - b.streak_rank);
  return list.sort((a, b) => {
    if (a.daily_rank === null && b.daily_rank === null) return a.username.localeCompare(b.username);
    if (a.daily_rank === null) return 1;
    if (b.daily_rank === null) return -1;
    return a.daily_rank - b.daily_rank;
  });
}

export type HeadToHeadVerdict = 'you' | 'them' | 'tied';

export function compareStreaks(mine: number, theirs: number): HeadToHeadVerdict {
  if (mine === theirs) return 'tied';
  return mine > theirs ? 'you' : 'them';
}

function client() {
  if (!isSupabaseConfigured || !supabase) throw new Error('Friends need a live database connection.');
  return supabase;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function fetchFriendsLeaderboard(date: string): Promise<FriendEntry[]> {
  const { data, error } = await client().rpc('friends_leaderboard', { p_date: date });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as FriendEntry[]).map((row) => ({
    ...row,
    score: num(row.score),
    daily_rank: num(row.daily_rank),
    streak_rank: Number(row.streak_rank),
  }));
}

export async function fetchHeadToHead(username: string, date: string): Promise<HeadToHead | null> {
  const { data, error } = await client().rpc('head_to_head', { p_username: normalizeUsername(username), p_date: date });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as HeadToHead[];
  const row = Array.isArray(rows) ? rows[0] : (rows as unknown as HeadToHead | null);
  if (!row) return null;
  return {
    ...row,
    shared_days: num(row.shared_days),
    my_wins: num(row.my_wins),
    their_wins: num(row.their_wins),
    ties: num(row.ties),
  };
}

export async function followUser(myId: string, rawUsername: string): Promise<'accepted' | 'pending'> {
  const username = normalizeUsername(rawUsername);
  if (!isValidUsername(username)) throw new Error('Enter a valid username.');
  const c = client();
  const { data: target, error: lookupError } = await c.from('profiles').select('id').eq('username', username).maybeSingle();
  if (lookupError) throw new Error('Could not look that user up.');
  if (!target) throw new Error('No player with that username.');
  if (target.id === myId) throw new Error('You cannot follow yourself.');
  const { error } = await c.from('user_follows').insert({ follower_id: myId, followee_id: target.id });
  if (error) {
    if (error.code === '23505') throw new Error('You already follow this player.');
    if (/follow limit/i.test(error.message)) throw new Error('You have reached the follow limit.');
    throw new Error('Could not follow this player.');
  }
  const { data } = await c.from('user_follows').select('status').eq('follower_id', myId).eq('followee_id', target.id).maybeSingle();
  return data?.status === 'pending' ? 'pending' : 'accepted';
}

export async function unfollow(myId: string, followeeId: string): Promise<void> {
  const { error } = await client().from('user_follows').delete().eq('follower_id', myId).eq('followee_id', followeeId);
  if (error) throw new Error('Could not unfollow.');
}

export async function acceptRequest(myId: string, followerId: string): Promise<void> {
  const { error } = await client()
    .from('user_follows')
    .update({ status: 'accepted' })
    .eq('followee_id', myId)
    .eq('follower_id', followerId)
    .eq('status', 'pending');
  if (error) throw new Error('Could not accept the request.');
}

export async function declineRequest(myId: string, followerId: string): Promise<void> {
  const { error } = await client().from('user_follows').delete().eq('followee_id', myId).eq('follower_id', followerId);
  if (error) throw new Error('Could not decline the request.');
}

interface FollowJoin {
  follower_id: string;
  followee_id: string;
  status: 'pending' | 'accepted';
  follower?: { username: string; display_name: string | null } | null;
  followee?: { username: string; display_name: string | null } | null;
}

export async function fetchFollowing(myId: string): Promise<FollowRow[]> {
  const { data, error } = await client()
    .from('user_follows')
    .select('follower_id, followee_id, status, followee:profiles!user_follows_followee_id_fkey(username, display_name)')
    .eq('follower_id', myId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as FollowJoin[]).map((r) => ({
    user_id: r.followee_id,
    username: r.followee?.username ?? 'unknown',
    display_name: r.followee?.display_name ?? null,
    status: r.status,
  }));
}

export async function fetchIncomingRequests(myId: string): Promise<FollowRow[]> {
  const { data, error } = await client()
    .from('user_follows')
    .select('follower_id, followee_id, status, follower:profiles!user_follows_follower_id_fkey(username, display_name)')
    .eq('followee_id', myId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as FollowJoin[]).map((r) => ({
    user_id: r.follower_id,
    username: r.follower?.username ?? 'unknown',
    display_name: r.follower?.display_name ?? null,
    status: r.status,
  }));
}

export async function fetchStatsVisibility(myId: string): Promise<StatsVisibility> {
  const { data, error } = await client().from('profiles').select('stats_visibility').eq('id', myId).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.stats_visibility === 'followers' ? 'followers' : 'public';
}

export async function setStatsVisibility(myId: string, value: StatsVisibility): Promise<void> {
  const { error } = await client().from('profiles').update({ stats_visibility: value }).eq('id', myId);
  if (error) throw new Error('Could not save your privacy setting.');
}
