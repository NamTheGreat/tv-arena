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
): Promise<{ success: true; score: number; date: string } | { success: false; error: string }> {
  if (!supabase) return { success: false, error: 'Supabase is not configured.' };
  try {
    const { data, error } = await supabase.rpc('submit_daily_score', {
      p_date: dateStr,
      p_answers: answers,
    });
    if (error || !data) {
      const message = error?.message || 'The server did not return a score.';
      console.warn('Daily score submission failed or rejected:', message);
      return { success: false, error: message };
    }
    return data as { success: true; score: number; date: string };
  } catch (err) {
    console.warn('Error calling submit_daily_score RPC:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error while saving score.',
    };
  }
}

export async function fetchMyDailyScore(
  dateStr: string
): Promise<{ score: number | null; unavailable: boolean }> {
  if (!supabase) return { score: null, unavailable: true };
  try {
    const { data, error } = await supabase
      .from('user_scores')
      .select('score')
      .eq('date', dateStr)
      .maybeSingle();
    if (error) return { score: null, unavailable: true };
    return { score: data?.score ?? null, unavailable: false };
  } catch {
    return { score: null, unavailable: true };
  }
}

export interface DailyScoreShare {
  token: string;
  date: string;
  score: number;
  correctness: boolean[];
}

export async function createDailyScoreShare(dateStr: string): Promise<DailyScoreShare | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc('create_daily_score_share', { p_date: dateStr });
    if (error || !data || typeof data !== 'object' || Array.isArray(data)) return null;
    const row = data as Record<string, unknown>;
    const { token, date, score, correctness } = row;
    if (
      typeof token !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token) ||
      date !== dateStr ||
      !Number.isInteger(score) || Number(score) < 0 || Number(score) > 10 ||
      !Array.isArray(correctness) || correctness.length !== 10 ||
      !correctness.every((item) => typeof item === 'boolean') ||
      correctness.filter(Boolean).length !== score
    ) return null;
    return { token, date: date as string, score: score as number, correctness: correctness as boolean[] };
  } catch {
    return null;
  }
}

export function correctnessGrid(correctness: boolean[]): string | null {
  if (correctness.length !== 10 || !correctness.every((item) => typeof item === 'boolean')) return null;
  return correctness.map((correct) => correct ? '1' : '0').join('');
}

export interface StoredDailyResult {
  date: string;
  score: number;
  correctness: boolean[];
  answers?: ('higher' | 'lower')[];
  completedAt: string;
  verified: boolean;
}

export function readStoredDailyResult(dateStr: string): StoredDailyResult | null {
  try {
    const raw = localStorage.getItem(`tv_arena_daily_${dateStr}`);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value === 'number' && Number.isFinite(value)) {
      return {
        date: dateStr,
        score: value,
        correctness: [],
        completedAt: new Date().toISOString(),
        verified: false,
      };
    }
    if (
      !value ||
      typeof value !== 'object' ||
      !('date' in value) ||
      value.date !== dateStr ||
      !('score' in value) ||
      typeof value.score !== 'number' ||
      !('correctness' in value) ||
      !Array.isArray(value.correctness) ||
      !value.correctness.every((item) => typeof item === 'boolean') ||
      ('answers' in value &&
        (!Array.isArray(value.answers) ||
          value.answers.length !== value.correctness.length ||
          !value.answers.every((item) => item === 'higher' || item === 'lower')))
    ) {
      return null;
    }
    return value as StoredDailyResult;
  } catch {
    return null;
  }
}

export function isCorrectDailyAnswer(
  answer: 'higher' | 'lower',
  knownScore: number,
  challengerScore: number
): boolean {
  return answer === 'higher' ? challengerScore > knownScore : challengerScore < knownScore;
}

export function storeDailyResult(result: StoredDailyResult): void {
  try {
    localStorage.setItem(`tv_arena_daily_${result.date}`, JSON.stringify(result));
  } catch {
    // Anonymous replay protection is best effort when browser storage is disabled.
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
