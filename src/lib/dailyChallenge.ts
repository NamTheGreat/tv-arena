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

// ponytail: deterministic 30-line Mulberry32 PRNG for Wordle-style daily seed
export function getDailySeed(dateStr?: string): number {
  const d = dateStr || new Date().toISOString().split('T')[0];
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
