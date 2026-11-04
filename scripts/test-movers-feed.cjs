const assert = require('node:assert/strict');
const { buildMoversFeed, escapeXml, fetchRows } = require('./generate-movers-feed.cjs');

const now = new Date('2026-11-04T12:00:00Z');
const feed = buildMoversFeed({
  siteUrl: 'https://example.test/',
  now,
  movers: [
    { period_start: '2026-10-26', series_id: 'old', slug: 'old-show', title: 'Old Week', delta_pct: 50, mover_rank: 1, faller_rank: 1, current_7d_score: 150, previous_7d_score: 100 },
    { period_start: '2026-11-02', series_id: 'a', slug: 'a-show', title: 'A & B', delta_pct: 20, mover_rank: 1, faller_rank: 2, current_7d_score: 120, previous_7d_score: 100 },
    { period_start: '2026-11-02', series_id: 'b', slug: 'b-show', title: 'B Show', delta_pct: -10, mover_rank: 2, faller_rank: 1, current_7d_score: 90, previous_7d_score: 100 },
    { period_start: '2026-11-02', series_id: 'c', slug: 'c-show', title: 'New Show', delta_pct: null, mover_rank: 3, faller_rank: 3, current_7d_score: 1, previous_7d_score: 0 },
  ],
  shows: [
    { id: 'a', slug: 'a-show', title: 'A & B' },
    { id: 'b', slug: 'b-show', title: 'B Show' },
  ],
  breakouts: [{ series_id: 'a', detected_date: '2026-11-03', signal: 'wiki', reason: 'Spike > baseline' }],
});

assert.match(feed, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
assert.match(feed, /<rss version="2\.0"/);
assert.match(feed, /Riser: A &amp; B \(\+20\.0%\)/);
assert.match(feed, /Faller: B Show \(-10\.0%\)/);
assert.match(feed, /Breakout: A &amp; B/);
assert.match(feed, /Spike &gt; baseline/);
assert.doesNotMatch(feed, /New Show/);
assert.doesNotMatch(feed, /Old Week/);
assert.match(feed, /https:\/\/example\.test\/movers\.xml/);
assert.equal(escapeXml(`&<>"'`), '&amp;&lt;&gt;&quot;&apos;');

(async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 404 });
  assert.deepEqual(await fetchRows('https://example.test', 'key', 'series_weekly_movers', 'select=*'), []);
  global.fetch = originalFetch;
  console.log('Movers RSS generation tests passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
