const assert = require('node:assert/strict');
const { buildMoversFeed, escapeXml } = require('./generate-movers-feed.cjs');

const now = new Date('2026-11-04T12:00:00Z');
const feed = buildMoversFeed({
  siteUrl: 'https://example.test/',
  now,
  leaderboard: [
    { id: 'a', slug: 'a-show', title: 'A & B', delta_pct: 20, current_7d_score: 120, previous_7d_score: 100 },
    { id: 'b', slug: 'b-show', title: 'B Show', delta_pct: -10, current_7d_score: 90, previous_7d_score: 100 },
    { id: 'c', slug: 'c-show', title: 'New Show', delta_pct: null, current_7d_score: 1, previous_7d_score: 0 },
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
assert.match(feed, /https:\/\/example\.test\/movers\.xml/);
assert.equal(escapeXml(`&<>"'`), '&amp;&lt;&gt;&quot;&apos;');
console.log('Movers RSS generation tests passed.');
