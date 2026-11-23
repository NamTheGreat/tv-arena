import { isSupabaseConfigured, supabase } from './supabase';
import { isBlockedUsername } from './usernameBlocklist';

export const COMMENT_MAX_LENGTH = 280;
export const COMMENTS_PAGE_SIZE = 20;

export interface ShowComment {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  username: string;
  display_name: string | null;
  best_streak: number;
}

export type CommentValidation = { ok: true; body: string } | { ok: false; error: string };

// Mirrors the series_comments CHECK constraints so users get a friendly message before a round trip.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const TAG_LIKE = /<\s*[/!?a-zA-Z]/;
const SCRIPT_URL = /(javascript|vbscript|data)\s*:/i;

export function validateCommentBody(raw: string): CommentValidation {
  const body = raw.replace(CONTROL_CHARS, '').trim();
  if (!body) return { ok: false, error: 'Write something first.' };
  if (body.length > COMMENT_MAX_LENGTH) {
    return { ok: false, error: `Keep it under ${COMMENT_MAX_LENGTH} characters.` };
  }
  if (TAG_LIKE.test(body) || SCRIPT_URL.test(body)) {
    return { ok: false, error: 'HTML and script links are not allowed in comments.' };
  }
  return { ok: true, body };
}

export function commentAuthorName(comment: Pick<ShowComment, 'username' | 'display_name'>): string {
  if (isBlockedUsername(comment.username)) return 'Anonymous';
  return comment.display_name?.trim() || `@${comment.username}`;
}

export function commentBadge(bestStreak: number): string | null {
  return bestStreak >= 3 ? `🔥 ${bestStreak}-day best streak` : null;
}

export function wasEdited(comment: Pick<ShowComment, 'created_at' | 'updated_at'>): boolean {
  return Date.parse(comment.updated_at) - Date.parse(comment.created_at) > 1000;
}

export function formatCommentTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const seconds = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

interface CommentRow {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  profiles: { username: string; display_name: string | null } | null;
}

export function toShowComment(row: CommentRow, bestStreaks: Map<string, number> = new Map()): ShowComment {
  return {
    id: row.id,
    user_id: row.user_id,
    body: row.body,
    created_at: row.created_at,
    updated_at: row.updated_at,
    username: row.profiles?.username ?? 'unknown',
    display_name: row.profiles?.display_name ?? null,
    best_streak: bestStreaks.get(row.user_id) ?? 0,
  };
}

const SELECT = 'id, user_id, body, created_at, updated_at, profiles!inner(username, display_name)';

/**
 * Streaks are private to profiles that chose followers-only stats, so badges come from the
 * privacy-aware get_profile_stats RPC. Any failure just means no badges.
 */
async function loadBestStreaks(userIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const ids = [...new Set(userIds)].slice(0, 100);
  if (!ids.length || !supabase) return map;
  try {
    const { data, error } = await supabase.rpc('get_profile_stats', { p_user_ids: ids });
    if (error || !Array.isArray(data)) return map;
    for (const row of data as unknown as { user_id: string; best_streak: number }[]) {
      map.set(row.user_id, Number(row.best_streak) || 0);
    }
  } catch {
    // badges are optional
  }
  return map;
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) throw new Error('Comments need a live database connection.');
  return supabase;
}

export async function fetchComments(seriesId: string, offset = 0): Promise<{ comments: ShowComment[]; hasMore: boolean }> {
  const client = requireClient();
  const { data, error } = await client
    .from('series_comments')
    .select(SELECT)
    .eq('series_id', seriesId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + COMMENTS_PAGE_SIZE); // one extra row tells us whether another page exists
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as CommentRow[];
  const page = rows.slice(0, COMMENTS_PAGE_SIZE);
  const streaks = await loadBestStreaks(page.map((r) => r.user_id));
  return { comments: page.map((r) => toShowComment(r, streaks)), hasMore: rows.length > COMMENTS_PAGE_SIZE };
}

export async function postComment(seriesId: string, userId: string, body: string): Promise<ShowComment> {
  const client = requireClient();
  const { data, error } = await client
    .from('series_comments')
    .insert({ series_id: seriesId, user_id: userId, body })
    .select(SELECT)
    .single();
  if (error) throw new Error(friendlyError(error.message));
  const row = data as unknown as CommentRow;
  return toShowComment(row, await loadBestStreaks([row.user_id]));
}

export async function updateComment(id: string, body: string): Promise<ShowComment> {
  const client = requireClient();
  const { data, error } = await client
    .from('series_comments')
    .update({ body })
    .eq('id', id)
    .select(SELECT)
    .single();
  if (error) throw new Error(friendlyError(error.message));
  const row = data as unknown as CommentRow;
  return toShowComment(row, await loadBestStreaks([row.user_id]));
}

export async function deleteComment(id: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.from('series_comments').delete().eq('id', id);
  if (error) throw new Error(friendlyError(error.message));
}

function friendlyError(message: string): string {
  if (/too many comments/i.test(message)) return 'You are posting too fast. Try again in a minute.';
  if (/series_comments_body/i.test(message)) return 'That comment was rejected. Check the length and remove any markup.';
  return 'Something went wrong. Please try again.';
}
