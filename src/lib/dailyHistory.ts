import { supabase } from './supabase';
import { getDailyChallengeNumber } from './dailyChallenge';

export interface DailyHistoryEntry {
  date: string;
  dailyNumber: number;
  score: number;
  correctness: boolean[];
  completedAt: string;
  streak: number;
}

export interface DailyHistoryPage {
  entries: DailyHistoryEntry[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Computes consecutive-day streak progression for each date from a chronologically sorted list of dates.
 */
export function calculateStreakProgression(datesAsc: string[]): Map<string, number> {
  const streakMap = new Map<string, number>();
  let currentStreak = 0;
  let lastDate: Date | null = null;

  for (const dateStr of datesAsc) {
    const currentDate = new Date(`${dateStr}T00:00:00Z`);
    if (!lastDate) {
      currentStreak = 1;
    } else {
      const diffMs = currentDate.getTime() - lastDate.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        currentStreak += 1;
      } else if (diffDays === 0) {
        // Identical calendar date safeguard
      } else {
        currentStreak = 1;
      }
    }
    streakMap.set(dateStr, currentStreak);
    lastDate = currentDate;
  }

  return streakMap;
}

/**
 * Loads a paged list of the authenticated user's verified past daily challenge scores.
 * Row-Level Security (RLS) on user_scores enforces that users can only select their own rows.
 */
export async function fetchUserDailyHistory(
  userId: string,
  page = 1,
  pageSize = 10
): Promise<{ data: DailyHistoryPage | null; error: string | null }> {
  if (!supabase || !userId) {
    return { data: null, error: 'Authentication required to view private history.' };
  }

  try {
    // 1. Get full chronological date list to compute streak progression
    const { data: allRows, error: countError } = await supabase
      .from('user_scores')
      .select('date')
      .eq('user_id', userId)
      .order('date', { ascending: true });

    if (countError) {
      return { data: null, error: countError.message };
    }

    const totalCount = allRows ? allRows.length : 0;
    if (totalCount === 0) {
      return {
        data: {
          entries: [],
          totalCount: 0,
          page,
          pageSize,
          totalPages: 0,
        },
        error: null,
      };
    }

    const allDatesAsc = allRows.map((r) => r.date);
    const streakMap = calculateStreakProgression(allDatesAsc);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // 2. Fetch page slice in descending order
    const { data: pageRows, error: pageError } = await supabase
      .from('user_scores')
      .select('date, score, correctness, completed_at')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .range(from, to);

    if (pageError) {
      return { data: null, error: pageError.message };
    }

    const entries: DailyHistoryEntry[] = (pageRows || []).map((row) => ({
      date: row.date,
      dailyNumber: getDailyChallengeNumber(row.date),
      score: Number(row.score),
      correctness: Array.isArray(row.correctness) ? row.correctness : [],
      completedAt: row.completed_at || row.date,
      streak: streakMap.get(row.date) || 1,
    }));

    return {
      data: {
        entries,
        totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
      },
      error: null,
    };
  } catch (err: any) {
    return { data: null, error: err?.message || 'Failed to fetch history' };
  }
}
