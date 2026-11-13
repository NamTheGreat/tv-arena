const fs = require('node:fs');
const path = require('node:path');

function escapeXml(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildMoversFeed({ movers = [], shows = [], breakouts = [], siteUrl = 'https://tv-arena.pages.dev', now = new Date() } = {}) {
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

async function fetchRows(baseUrl, key, table, query) {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/rest/v1/${table}?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) {
    if (response.status === 404 && table === 'series_weekly_movers') {
      console.warn('Weekly movers view is not deployed; generating a feed without mover entries.');
      return [];
    }
    throw new Error(`Supabase ${table} query failed (${response.status})`);
  }
  return response.json();
}

async function generate() {
  const siteUrl = process.env.VITE_SITE_URL || 'https://tv-arena.pages.dev';
  let movers = [];
  let shows = [];
  let breakouts = [];
  const baseUrl = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (baseUrl && key) {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 6);
    const date = since.toISOString().slice(0, 10);
    [movers, shows, breakouts] = await Promise.all([
      fetchRows(baseUrl, key, 'series_weekly_movers', 'select=period_start,series_id,slug,title,network,current_7d_score,previous_7d_score,delta_pct,mover_rank,faller_rank&order=period_start.desc,mover_rank.asc&limit=1000'),
      fetchRows(baseUrl, key, 'series', 'select=id,slug,title&limit=1000'),
      fetchRows(baseUrl, key, 'series_breakouts', `select=series_id,detected_date,signal,reason&detected_date=gte.${date}&order=detected_date.desc&limit=50`),
    ]);
  } else {
    console.warn('Supabase build variables missing; generating a valid empty movers feed.');
  }

  const feedContent = buildMoversFeed({ movers, shows, breakouts, siteUrl });
  const destination = path.join(process.cwd(), 'public', 'movers.xml');
  const feedDestination = path.join(process.cwd(), 'public', 'feed', 'movers.xml');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.mkdirSync(path.dirname(feedDestination), { recursive: true });
  fs.writeFileSync(destination, feedContent, 'utf8');
  fs.writeFileSync(feedDestination, feedContent, 'utf8');
}

if (require.main === module) {
  generate().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { buildMoversFeed, escapeXml, fetchRows };
