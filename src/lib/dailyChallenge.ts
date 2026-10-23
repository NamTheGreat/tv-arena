import { supabase } from './supabase';

export const LAUNCH_DATE = '2026-10-15';

export function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

export function getDailyChallengeNumber(dateStr?: string): number {
  const target = new Date(dateStr || getTodayDateString());
  const launch = new Date(LAUNCH_DATE);
  const diffTime = target.getTime() - launch.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays + 1);
}

// Deterministic 30-line Mulberry32 PRNG retained for deterministic fallbacks
export function getDailySeed(dateStr?: string): number {
  const d = dateStr || getTodayDateString();
  let hash = 0;
  for (let i = 0; i < d.length; i++) {
    hash = (hash << 5) - hash + d.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDailyMatchupIndices(listLength: number, totalRounds: number = 10): number[] {
  if (listLength <= 1) return [];
  const seed = getDailySeed();
  const rng = mulberry32(seed);

  const indices: number[] = [];
  const count = totalRounds + 1; // 10 rounds needs 11 shows (known + 10 challengers)

  while (indices.length < count) {
    const candidate = Math.floor(rng() * listLength);
    if (indices.length === 0 || indices[indices.length - 1] !== candidate) {
      indices.push(candidate);
    }
  }

  return indices;
}

export async function fetchDailyDeck(dateStr?: string): Promise<string[] | null> {
  if (!supabase) return null;
  const d = dateStr || getTodayDateString();
  try {
    const { data, error } = await supabase
      .from('daily_challenges')
      .select('series_ids')
      .eq('date', d)
      .maybeSingle();

    if (error || !data || !Array.isArray(data.series_ids) || data.series_ids.length < 2) {
      return null;
    }
    return data.series_ids as string[];
  } catch {
    return null;
  }
}

export async function submitDailyScore(
  dateStr: string,
  answers: ('higher' | 'lower')[]
): Promise<{ success: boolean; score: number; date: string } | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc('submit_daily_score', {
      p_date: dateStr,
      p_answers: answers,
    });
    if (error || !data) {
      console.warn('Daily score submission failed or rejected:', error?.message);
      return null;
    }
    return data as { success: boolean; score: number; date: string };
  } catch (err) {
    console.warn('Error calling submit_daily_score RPC:', err);
    return null;
  }
}

export interface LeaderboardEntry {
  username: string;
  score: number;
  streak: number;
  rank: number;
}

export async function fetchDailyLeaderboard(dateStr?: string): Promise<LeaderboardEntry[]> {
  if (!supabase) return [];
  const d = dateStr || getTodayDateString();
  try {
    const { data, error } = await supabase.rpc('daily_leaderboard', {
      p_date: d,
    });
    if (error || !data) return [];
    return data as unknown as LeaderboardEntry[];
  } catch {
    return [];
  }
}

export async function fetchStreakLeaderboard(): Promise<LeaderboardEntry[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.rpc('streak_leaderboard');
    if (error || !data) return [];
    return data as unknown as LeaderboardEntry[];
  } catch {
    return [];
  }
}
