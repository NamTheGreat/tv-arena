import { describe, expect, it } from 'vitest';
import { SeriesItem } from '../lib/supabase';
import { drawNextEndlessIndex, getEndlessDeck, shuffledIndexes } from '../lib/endlessGame';

const show = (id: string, score: number, days: number): SeriesItem => ({
  id,
  tmdb_id: Number(id),
  slug: id,
  title: id,
  network: 'Network',
  network_group: 'Other',
  genre_group: 'Drama',
  release_years: '2020–2025',
  chart_color: '#C66A3D',
  wiki_slug: id,
  reddit_query: id,
  buzz_score: score,
  delta_pct: null,
  updated_at: null,
  daily_series: [],
  daily_dates: Array.from({ length: days }, (_, day) => `2026-10-${String(day + 1).padStart(2, '0')}`),
});

describe('endless game selection', () => {
  it('keeps positive, seven-day shows with unique scores', () => {
    const deck = getEndlessDeck([
      show('1', 0, 10),
      show('2', 100, 6),
      show('3', 100, 10),
      show('4', 200, 8),
      show('5', 200, 8),
      show('6', 300, 7),
    ]);
    expect(deck.map(({ id }) => id)).toEqual(['3', '6']);
  });

  it('draws each show once per shuffled bag and avoids repeating the current show', () => {
    const order = shuffledIndexes(4, () => 0);
    expect(new Set(order).size).toBe(4);
    let bag = order.slice(2);
    const drawn = [order[0], order[1]];
    for (let i = 0; i < 2; i += 1) {
      const next = drawNextEndlessIndex(bag, 4, drawn[drawn.length - 1], () => 0);
      drawn.push(next.index);
      bag = next.bag;
    }
    expect(new Set(drawn).size).toBe(4);
    const nextCycle = drawNextEndlessIndex(bag, 4, drawn[3], () => 0);
    expect(nextCycle.index).not.toBe(drawn[3]);
  });
});
