import { Page } from '@playwright/test';

export const shows = Array.from({ length: 11 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  tmdb_id: index + 1,
  slug: `show-${index + 1}`,
  title: `Show ${index + 1}`,
  network: 'Network',
  genre_group: 'Drama',
  release_years: '2020–2025',
  chart_color: '#C66A3D',
  wiki_slug: `Show_${index + 1}`,
  reddit_query: `Show ${index + 1}`,
  buzz_score: (index + 1) * 100,
  current_7d_score: (index + 1) * 100,
  previous_7d_score: 0,
  delta_pct: 0,
  rank: index + 1,
    daily_dates: Array.from({ length: 7 }, (_, day) => `2026-11-${String(day + 1).padStart(2, '0')}`),
}));

export async function mockSupabase(page: Page, dailyDeckLength = shows.length) {
  await page.route('https://test.supabase.co/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body: unknown = [];

    if (path.endsWith('/series_leaderboard')) body = shows;
    else if (path.endsWith('/series_recent_telemetry')) {
      body = shows.map((show) => ({ series_id: show.id, daily_series: [show.buzz_score], daily_dates: show.daily_dates }));
    } else if (path.endsWith('/daily_challenges')) {
      body = [{ series_ids: shows.slice(0, dailyDeckLength).map((show) => show.id) }];
    } else if (path.endsWith('/rpc/get_daily_score_share')) {
      body = {
        date: '2026-10-15',
        score: 7,
        correctness: [true, true, false, true, true, true, false, true, true, false],
      };
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}
