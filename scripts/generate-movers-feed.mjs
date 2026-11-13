import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPostgrestRows } from './lib/fetchPostgrestRows.mjs';

export function escapeXml(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildMoversFeed({ movers = [], shows = [], breakouts = [], siteUrl = 'https://tv-arena.pages.dev', now = new Date() } = {}) {
  const base = siteUrl.replace(/\/$/, '');
  const latestPeriod = movers.reduce((latest, show) => show.period_start > latest ? show.period_start : latest, '');
  const eligible = movers.filter((show) => show.period_start === latestPeriod && show.delta_pct != null && Number.isFinite(Number(show.delta_pct)));
  const risers = eligible.filter((show) => Number(show.delta_pct) > 0 && show.mover_rank <= 10)
    .sort((a, b) => a.mover_rank - b.mover_rank);
  const fallers = eligible.filter((show) => Number(show.delta_pct) < 0 && show.faller_rank <= 10)
    .sort((a, b) => a.faller_rank - b.faller_rank);
  const seriesById = new Map(shows.map((show) => [show.id, show]));
  const items = [];
  const addShowItem = (show, category) => {
    const url = `${base}/show/${encodeURIComponent(show.slug)}`;
    const delta = Number(show.delta_pct);
    items.push(`    <item>
      <title>${escapeXml(`${category}: ${show.title} (${delta > 0 ? '+' : ''}${delta.toFixed(1)}%)`)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="false">${escapeXml(`${category}:${show.id}`)}</guid>
      <category>${escapeXml(category)}</category>
      <description>${escapeXml(`Current 7-day score: ${Number(show.current_7d_score || 0)}; prior 7-day score: ${Number(show.previous_7d_score || 0)}; change: ${delta.toFixed(1)}%.`)}</description>
      <pubDate>${now.toUTCString()}</pubDate>
    </item>`);
  };

  risers.forEach((show) => addShowItem(show, 'Riser'));
  fallers.forEach((show) => addShowItem(show, 'Faller'));
  [...breakouts]
    .sort((a, b) => String(b.detected_date).localeCompare(String(a.detected_date)))
    .slice(0, 10)
    .forEach((breakout) => {
      const show = seriesById.get(breakout.series_id);
      if (!show) return;
      const url = `${base}/show/${encodeURIComponent(show.slug)}`;
      items.push(`    <item>
      <title>${escapeXml(`Breakout: ${show.title} (${breakout.detected_date})`)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="false">${escapeXml(`Breakout:${breakout.series_id}:${breakout.detected_date}:${breakout.signal || ''}`)}</guid>
      <category>Breakout</category>
      <description>${escapeXml(breakout.reason)}</description>
      <pubDate>${now.toUTCString()}</pubDate>
    </item>`);
    });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>TV Arena Weekly Movers</title>
    <link>${escapeXml(`${base}/movers`)}</link>
    <description>Shows ranked by the change between the latest seven days and the prior seven days, with recent breakout detections.</description>
    <language>en-us</language>
    <lastBuildDate>${now.toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(`${base}/movers.xml`)}" rel="self" type="application/rss+xml" />
${items.join('\n')}
  </channel>
</rss>
`;
}

export const fetchRows = fetchPostgrestRows;

export async function generate() {
  const siteUrl = process.env.VITE_SITE_URL || 'https://tv-arena.pages.dev';
  let movers = [];
  let shows = [];
  let breakouts = [];
  const baseUrl = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (baseUrl && key) {
    try {
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - 6);
      const date = since.toISOString().slice(0, 10);
      [movers, shows, breakouts] = await Promise.all([
        fetchPostgrestRows(baseUrl, key, 'series_weekly_movers', 'period_start,series_id,slug,title,network,current_7d_score,previous_7d_score,delta_pct,mover_rank,faller_rank', { order: 'period_start.desc,mover_rank.asc' }),
        fetchPostgrestRows(baseUrl, key, 'series', 'id,slug,title', { order: 'id.asc' }),
        fetchPostgrestRows(baseUrl, key, 'series_breakouts', 'series_id,detected_date,signal,reason', {
          order: 'detected_date.desc',
          filter: ['detected_date', `gte.${date}`],
          pageSize: 50,
        }),
      ]);
    } catch (error) {
      console.warn(`Movers feed fetch failed; generating valid empty feed: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    console.warn('Supabase build variables missing; generating a valid empty movers feed.');
  }

  const destination = path.join(process.cwd(), 'public', 'movers.xml');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, buildMoversFeed({ movers, shows, breakouts, siteUrl }), 'utf8');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  generate().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
