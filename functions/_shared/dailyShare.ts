export interface DailyShareEnv {
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

export interface DailyShareResult {
  dailyNumber: number;
  score: number;
  correctness: boolean[];
  query: string;
}

interface ServerScoreShare {
  date: string;
  score: number;
  correctness: boolean[];
}

const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseDailyNumber(value: string): number | null {
  if (!/^[1-9]\d{0,5}$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

export function dailyNumberForDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  const launch = Date.parse('2026-10-15T00:00:00.000Z');
  return Math.max(1, Math.floor((date.getTime() - launch) / 86_400_000) + 1);
}

export function parseDailyShareInput(search: URLSearchParams):
  | { kind: 'anonymous'; grid: string; score: number }
  | { kind: 'signed-in'; token: string }
  | null {
  const entries = [...search.entries()];
  if (entries.length !== 1) return null;
  const [key, value] = entries[0];
  if (key === 'g' && /^[01]{10}$/.test(value)) {
    return { kind: 'anonymous', grid: value, score: [...value].filter((bit) => bit === '1').length };
  }
  if (key === 's' && TOKEN_PATTERN.test(value)) return { kind: 'signed-in', token: value };
  return null;
}

async function fetchServerScore(env: DailyShareEnv, token: string): Promise<ServerScoreShare | null> {
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  try {
    const response = await fetch(`${url}/rest/v1/rpc/get_daily_score_share`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_share_token: token }),
    });
    if (!response.ok) return null;
    const value: unknown = await response.json();
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const { date, score, correctness } = record;
    if (
      typeof date !== 'string' ||
      !Number.isInteger(score) ||
      !Array.isArray(correctness) ||
      correctness.length !== 10 ||
      !correctness.every((item) => typeof item === 'boolean') ||
      correctness.filter(Boolean).length !== score
    ) return null;
    return { date, score: score as number, correctness: correctness as boolean[] };
  } catch {
    return null;
  }
}

export async function resolveDailyShare(
  rawNumber: string,
  search: URLSearchParams,
  env: DailyShareEnv
): Promise<DailyShareResult | null> {
  const dailyNumber = parseDailyNumber(rawNumber);
  const input = parseDailyShareInput(search);
  if (dailyNumber === null || !input) return null;

  if (input.kind === 'anonymous') {
    return { dailyNumber, score: input.score, correctness: [...input.grid].map((bit) => bit === '1'), query: `g=${input.grid}` };
  }

  const row = await fetchServerScore(env, input.token);
  if (!row || dailyNumberForDate(row.date) !== dailyNumber) return null;
  return {
    dailyNumber,
    score: row.score,
    correctness: row.correctness,
    query: `s=${encodeURIComponent(input.token)}`,
  };
}
