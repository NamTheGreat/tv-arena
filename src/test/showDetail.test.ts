import { describe, expect, it } from 'vitest';
import { findSimilarShows } from '../lib/showDetail';
import { SeriesItem } from '../lib/supabase';

function series(slug: string, network: string, genre_group: string, buzz_score: number): SeriesItem {
  return {
    id: slug,
    tmdb_id: buzz_score,
    slug,
    title: slug,
    network,
    genre_group,
    release_years: '2020–present',
    chart_color: '#c66a3d',
    wiki_slug: slug,
    reddit_query: slug,
    buzz_score,
    delta_pct: null,
    updated_at: null,
    daily_series: [],
  };
}

describe('findSimilarShows', () => {
  it('ranks same-platform or same-genre shows by score distance and limits to three', () => {
    const show = series('current', 'Netflix', 'Drama', 100);
    const candidates = [
      series('far-drama', 'HBO', 'Drama', 1000),
      series('close-platform', 'Netflix', 'Comedy', 105),
      series('near-drama', 'Apple TV+', 'Drama', 102),
      series('unrelated', 'Prime Video', 'Mystery', 101),
      series('next-drama', 'BBC', 'Drama', 110),
      series('fourth', 'Netflix', 'Fantasy', 115),
    ];

    expect(findSimilarShows(show, [show, ...candidates]).map((item) => item.slug))
      .toEqual(['near-drama', 'close-platform', 'next-drama']);
  });
});
