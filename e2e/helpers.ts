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
    } else if (path.endsWith('/series_comments')) {
      body = [{
        id: '00000000-0000-0000-0000-0000000000c1', user_id: '00000000-0000-0000-0000-0000000000u1',
        body: 'Absolutely deserves the top spot.', created_at: '2026-11-23T10:00:00Z', updated_at: '2026-11-23T10:00:00Z',
        profiles: { username: 'test_pilot', display_name: 'Test Pilot', best_streak: 5 },
      }];
    } else if (path.endsWith('/series_hall_of_fame')) {
      body = [
        { category: 'record_day', place: 1, record_rank: 1, series_id: shows[0].id, slug: shows[0].slug, title: shows[0].title, chart_color: null, value: 9000, start_date: '2026-03-05', end_date: '2026-03-05' },
        { category: 'record_day', place: 2, record_rank: 2, series_id: shows[1].id, slug: shows[1].slug, title: shows[1].title, chart_color: null, value: 4000, start_date: '2026-03-12', end_date: '2026-03-12' },
        { category: 'record_day', place: 3, record_rank: 2, series_id: shows[2].id, slug: shows[2].slug, title: shows[2].title, chart_color: null, value: 4000, start_date: '2026-03-13', end_date: '2026-03-13' },
        { category: 'number_one_streak', place: 1, record_rank: 1, series_id: shows[0].id, slug: shows[0].slug, title: shows[0].title, chart_color: null, value: 4, start_date: '2026-03-04', end_date: '2026-03-07' },
      ];
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
