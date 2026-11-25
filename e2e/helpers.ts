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
        profiles: { username: 'test_pilot', display_name: 'Test Pilot' },
      }];
    } else if (path.endsWith('/series_hall_of_fame')) {
      body = [
        { category: 'record_day', place: 1, record_rank: 1, series_id: shows[0].id, slug: shows[0].slug, title: shows[0].title, chart_color: null, value: 9000, start_date: '2026-03-05', end_date: '2026-03-05' },
        { category: 'record_day', place: 2, record_rank: 2, series_id: shows[1].id, slug: shows[1].slug, title: shows[1].title, chart_color: null, value: 4000, start_date: '2026-03-12', end_date: '2026-03-12' },
        { category: 'record_day', place: 3, record_rank: 2, series_id: shows[2].id, slug: shows[2].slug, title: shows[2].title, chart_color: null, value: 4000, start_date: '2026-03-13', end_date: '2026-03-13' },
        { category: 'number_one_streak', place: 1, record_rank: 1, series_id: shows[0].id, slug: shows[0].slug, title: shows[0].title, chart_color: null, value: 4, start_date: '2026-03-04', end_date: '2026-03-07' },
      ];
    } else if (path.endsWith('/rpc/get_profile_stats')) {
      body = [{ user_id: '00000000-0000-0000-0000-0000000000u1', current_streak: 2, best_streak: 5 }];
    } else if (path.endsWith('/series_premiere_impact')) {
      body = [
        { event_id: 1, series_id: shows[0].id, event_date: '2026-01-10', label: 'Season 1', premiere_number: 1, pre_days: 7, post_days: 7, pre_avg: 1000, post_avg: 3000, delta: 2000, multiplier: 3 },
        { event_id: 2, series_id: shows[0].id, event_date: '2026-06-10', label: 'Season 2', premiere_number: 2, pre_days: 7, post_days: 7, pre_avg: 2000, post_avg: 3000, delta: 1000, multiplier: 1.5 },
      ];
    } else if (path.endsWith('/insights_platform_share_weekly')) {
      body = ['2026-10-26', '2026-11-02', '2026-11-09'].flatMap((week, i) => [
        { week_start: week, network_group: 'Netflix', shows: 40 - i * 4, share_pct: 40 - i * 4, score_share_pct: 50 - i * 3, ranked_shows: 100 },
        { week_start: week, network_group: 'HBO', shows: 20 + i * 2, share_pct: 20 + i * 2, score_share_pct: 25, ranked_shows: 100 },
        { week_start: week, network_group: 'Apple TV+', shows: 10, share_pct: 10, score_share_pct: 12, ranked_shows: 100 },
      ]);
    } else if (path.endsWith('/insights_genre_share_weekly')) {
      body = ['2026-10-26', '2026-11-02', '2026-11-09'].flatMap((week, i) => [
        { week_start: week, genre_group: 'Drama & Sci-Fi', shows: 30, total_daily_score: 900000, avg_score_per_show: 30000, share_pct: 50 + i },
        { week_start: week, genre_group: 'Comedy', shows: 20, total_daily_score: 400000, avg_score_per_show: 20000, share_pct: 30 - i },
      ]);
    } else if (path.endsWith('/insights_signal_points')) {
      body = Array.from({ length: 12 }, (_, n) => ({
        series_id: `id-${n}`, slug: `show-${n}`, title: `Show ${n}`, network_group: 'Netflix', genre_group: 'Drama & Sci-Fi', observed_days: 7,
        avg_wiki_views: 1000 * (n + 1), avg_reddit_comments: 40 * (n + 1) + (n % 3) * 15, avg_reddit_upvotes: 200 * (n + 1), avg_daily_score: 12000 * (n + 1),
      }));
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
