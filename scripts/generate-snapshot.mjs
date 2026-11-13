import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = resolve(root, 'public/snapshot.json');
const csvPath = resolve(root, 'public/snapshot.csv');
const pageSize = 1000;

async function removeGeneratedFiles() {
  await Promise.all([rm(snapshotPath, { force: true }), rm(csvPath, { force: true })]);
}

async function fetchRows(baseUrl, key, table, select, options = {}) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const url = new URL(`/rest/v1/${table}`, baseUrl);
    url.searchParams.set('select', select);
    if (options.order) url.searchParams.set('order', options.order);
    if (options.filter) url.searchParams.set(options.filter[0], options.filter[1]);
    const response = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Range-Unit': 'items',
        Range: `${offset}-${offset + pageSize - 1}`,
      },
    });
    if (response.status === 416) return rows;
    if (!response.ok) throw new Error(`${table} returned HTTP ${response.status}`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error(`${table} returned an invalid response`);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function csvCell(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

async function main() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    await removeGeneratedFiles();
    console.warn('Snapshot generation skipped: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the Pages build environment.');
    return;
  }

  try {
    const baseUrl = `${supabaseUrl.replace(/\/$/, '')}/`;
    const [leaderboard, metadata, telemetry, events, breakouts, contributions] = await Promise.all([
      fetchRows(baseUrl, anonKey, 'series_leaderboard', 'id,tmdb_id,slug,title,network,network_group,genre_group,release_years,chart_color,current_7d_score,previous_7d_score,delta_pct,rank', { order: 'rank.asc' }),
      fetchRows(baseUrl, anonKey, 'series', 'id,tmdb_id,slug,title,network,network_group,genre_group,release_years,chart_color,wiki_slug,reddit_query,updated_at', { order: 'slug.asc' }),
      fetchRows(baseUrl, anonKey, 'series_recent_telemetry', 'series_id,daily_series,daily_dates', { order: 'series_id.asc' }),
      fetchRows(baseUrl, anonKey, 'series_events', 'id,series_id,event_date,kind,label,source', { order: 'event_date.asc' }),
      fetchRows(baseUrl, anonKey, 'series_breakouts', 'series_id,reason,detected_date', {
        order: 'detected_date.desc',
        filter: ['detected_date', `gte.${new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10)}`],
      }),
      fetchRows(baseUrl, anonKey, 'series_signal_contributions', 'series_id,wiki_contribution,reddit_contribution,telemetry_days,reddit_observed_days', { order: 'series_id.asc' }),
    ]);

    const metadataById = new Map(metadata.map((row) => [row.id, row]));
    const telemetryById = new Map(telemetry.map((row) => [row.series_id, row]));
    const eventsById = new Map();
    for (const event of events) {
      const seriesEvents = eventsById.get(event.series_id) || [];
      seriesEvents.push(event);
      eventsById.set(event.series_id, seriesEvents);
    }
    const breakoutById = new Map();
    for (const breakout of breakouts) {
      if (!breakoutById.has(breakout.series_id)) breakoutById.set(breakout.series_id, breakout.reason);
    }
    const contributionsById = new Map();
    for (const contrib of contributions) {
      contributionsById.set(contrib.series_id, {
        wiki_contribution: Number(contrib.wiki_contribution),
        reddit_contribution: Number(contrib.reddit_contribution),
        telemetry_days: Number(contrib.telemetry_days),
        reddit_observed_days: Number(contrib.reddit_observed_days),
      });
    }

    const series = leaderboard.map((row) => {
      const details = metadataById.get(row.id);
      if (!details) throw new Error(`No series metadata found for ${row.id}`);
      const recent = telemetryById.get(row.id);
      const score = Number(row.current_7d_score ?? 0);
      return {
        ...details,
        ...row,
        buzz_score: score,
        current_7d_score: score,
        previous_7d_score: Number(row.previous_7d_score ?? 0),
        delta_pct: row.delta_pct == null ? null : Number(row.delta_pct),
        daily_series: recent?.daily_series?.map(Number) || [score],
        daily_dates: recent?.daily_dates || [],
        events: eventsById.get(row.id) || [],
        is_breakout: breakoutById.has(row.id),
        breakout_reason: breakoutById.get(row.id),
        signal_contributions: contributionsById.get(row.id),
      };
    });
    const snapshot = { generated_at: new Date().toISOString(), series };
    await mkdir(dirname(snapshotPath), { recursive: true });
    await writeFile(snapshotPath, `${JSON.stringify(snapshot)}\n`);

    const columns = ['id', 'slug', 'title', 'network', 'network_group', 'genre_group', 'current_7d_score', 'previous_7d_score', 'delta_pct', 'daily_dates', 'daily_series'];
    const csv = [columns.join(','), ...series.map((row) => columns.map((column) => csvCell(row[column])).join(','))].join('\n');
    await writeFile(csvPath, `${csv}\n`);
    console.log(`Generated public snapshot for ${series.length} shows.`);
  } catch (error) {
    await removeGeneratedFiles();
    console.warn(`Snapshot generation failed; the app will use Supabase directly: ${error instanceof Error ? error.message : String(error)}`);
  }
}

await main();
