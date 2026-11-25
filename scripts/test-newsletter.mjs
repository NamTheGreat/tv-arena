import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildFacts, buildPrompt, callGemini, generateValidatedDraft, renderMarkdown, validateDraft } from './lib/newsletter.mjs';
import { run } from './generate-newsletter.mjs';

const movers = [
  { period_start: '2026-11-09', series_id: 'old', slug: 'old', title: 'Old Week', network: 'N', current_7d_score: 1, previous_7d_score: 1, delta_pct: 5, mover_rank: 1, faller_rank: 9 },
  { period_start: '2026-11-16', series_id: 'a', slug: 'show-a', title: 'Show A', network: 'HBO', current_7d_score: 123456, previous_7d_score: 100000, delta_pct: 23.46, mover_rank: 1, faller_rank: 3 },
  { period_start: '2026-11-16', series_id: 'b', slug: 'show-b', title: '9-1-1', network: 'Fox', current_7d_score: 50000, previous_7d_score: 80000, delta_pct: -37.5, mover_rank: 3, faller_rank: 1 },
  { period_start: '2026-11-16', series_id: 'c', slug: 'show-c', title: 'Flat', network: 'X', current_7d_score: 10, previous_7d_score: 10, delta_pct: 0, mover_rank: 2, faller_rank: 2 },
  { period_start: '2026-11-16', series_id: 'd', slug: 'show-d', title: 'New', network: 'X', current_7d_score: 10, previous_7d_score: 0, delta_pct: null, mover_rank: 4, faller_rank: 4 },
];
const shows = [{ id: 'a', slug: 'show-a', title: 'Show A' }, { id: 'b', slug: 'show-b', title: '9-1-1' }];
const breakouts = [
  { series_id: 'a', detected_date: '2026-11-18', signal: 'wiki', reason: 'Spike over baseline', pct_over_baseline: 310.4 },
  { series_id: 'a', detected_date: '2026-11-19', signal: 'reddit', reason: 'dup show', pct_over_baseline: 100 },
  { series_id: 'b', detected_date: '2026-11-30', signal: 'wiki', reason: 'outside week', pct_over_baseline: 900 },
];

// ---- facts ----
const report = buildFacts({ movers, shows, breakouts, siteUrl: 'https://example.test/' });
assert.equal(report.week_start, '2026-11-16');
assert.equal(report.week_end, '2026-11-22');
assert.deepEqual(report.facts.map((f) => [f.id, f.type, f.title]), [['F1', 'riser', 'Show A'], ['F2', 'faller', '9-1-1'], ['F3', 'breakout', 'Show A']]);
assert.equal(report.facts[0].change, '+23.5%');
assert.equal(report.facts[0].current_7d_score, '123,456');
assert.equal(report.facts[2].pct_over_baseline, '310%');
assert.equal(report.facts[0].url, 'https://example.test/show/show-a');
assert.equal(buildFacts({ movers: [] }), null);
assert.equal(buildFacts({ movers: [movers[3]] }), null, 'flat/no-delta weeks produce no draft');

// ---- validation ----
const good = {
  headline: 'Show A surges while 9-1-1 cools off',
  intro: 'A busy week at the top and the bottom of the TV Arena movers board, with one clear breakout.',
  sections: [
    { heading: 'Biggest risers', paragraphs: [{ text: 'Show A climbed +23.5% to 123,456 from 100,000 the week before.', cites: ['F1'] }] },
    { heading: 'Biggest fallers', paragraphs: [{ text: '9-1-1 slipped -37.5%, from 80,000 to 50,000.', cites: ['F2'] }] },
    { heading: 'Breakouts', paragraphs: [{ text: 'Show A also broke out on wiki, 310% over its baseline on 2026-11-18.', cites: ['F3'] }] },
  ],
};
assert.equal(validateDraft(good, report).ok, true);
const bad = (mutate) => { const d = structuredClone(good); mutate(d); return validateDraft(d, report); };
const reasons = (r) => r.errors.join(' | ');
assert.match(reasons(bad((d) => { d.sections[0].paragraphs[0].text = 'Show A climbed 99% overnight, a huge week for the show.'; })), /number "99"/);
assert.match(reasons(bad((d) => { d.sections[0].paragraphs[0].cites = ['F9']; })), /unknown fact id "F9"/);
assert.match(reasons(bad((d) => { d.sections.pop(); })), /fact F3 is never cited/);
assert.match(reasons(bad((d) => { d.extra = 1; })), /unexpected key "extra"/);
assert.match(reasons(bad((d) => { d.sections[0].paragraphs[0].text = 'Read more at https://evil.test about Show A rising +23.5%.'; })), /markup or links/);
assert.match(reasons(bad((d) => { d.sections[0].paragraphs[0].text = '<b>Show A</b> climbed +23.5% this week to 123,456 points.'; })), /markup or links/);
assert.match(reasons(bad((d) => { d.headline = 'Short'; })), /headline/);
assert.match(reasons(bad((d) => { d.sections[1].heading = 'Biggest risers'; })), /duplicate heading/);
assert.match(reasons(bad((d) => { d.sections[0].heading = 'Hot takes'; })), /heading must be one of/);
assert.equal(validateDraft('nope', report).ok, false);
assert.equal(validateDraft(null, report).ok, false);

// ---- rendering: links and sources come from facts ----
const md = renderMarkdown(good, report, { model: 'gemini-test' });
assert.match(md, /^# Show A surges/);
assert.match(md, /\[Show A\]\(https:\/\/example\.test\/show\/show-a\)/);
assert.match(md, /## Sources/);
assert.match(md, /\| \[9-1-1\]\(https:\/\/example\.test\/show\/show-b\) \| faller \| -37\.5% \(80,000 to 50,000\) \|/);
assert.match(md, /review before publishing/);

// ---- prompt guards ----
const { system, user } = buildPrompt(report);
assert.match(system, /untrusted data/);
assert.equal(JSON.parse(user).facts.length, 3);

// ---- Gemini client: key in header only, errors never include it ----
const SECRET = 'AIza-super-secret-key';
let seen;
const okFetch = (payload) => async (url, init) => {
  seen = { url: String(url), init };
  return { ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(payload) }] } }] }) };
};
assert.deepEqual(await callGemini({ apiKey: SECRET, model: 'm', system: 's', user: 'u', baseUrl: 'https://g.test', fetchImpl: okFetch(good) }), good);
assert.equal(seen.url, 'https://g.test/v1beta/models/m:generateContent');
assert.equal(seen.init.headers['x-goog-api-key'], SECRET);
assert.ok(!seen.url.includes(SECRET) && !seen.init.body.includes(SECRET), 'key must not be in URL or body');
assert.equal(JSON.parse(seen.init.body).generationConfig.responseMimeType, 'application/json');
await assert.rejects(callGemini({ apiKey: SECRET, model: 'm', system: 's', user: 'u', fetchImpl: async () => ({ ok: false, status: 403 }) }), (e) => /HTTP 403/.test(e.message) && !e.message.includes(SECRET));
await assert.rejects(callGemini({ apiKey: SECRET, model: 'm', system: 's', user: 'u', fetchImpl: async () => { throw new Error(`boom ${SECRET}`); } }), (e) => !e.message.includes(SECRET));
await assert.rejects(callGemini({ apiKey: SECRET, model: 'm', system: 's', user: 'u', fetchImpl: async () => ({ ok: true, json: async () => ({ promptFeedback: { blockReason: 'SAFETY' } }) }) }), /blocked/);
await assert.rejects(callGemini({ apiKey: SECRET, model: 'm', system: 's', user: 'u', fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{' }] } }] }) }) }), /stopped early/);
await assert.rejects(callGemini({ apiKey: SECRET, model: 'm', system: 's', user: 'u', fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not json' }] } }] }) }) }), /invalid JSON/);

// ---- retry with feedback, then give up ----
let calls = 0; const prompts = [];
const flaky = async (url, init) => {
  calls++; prompts.push(JSON.parse(init.body).contents[0].parts[0].text);
  const payload = calls === 1 ? { ...good, intro: 'Short intro with an invented 777 figure that is not allowed anywhere in the facts at all.' } : good;
  return okFetch(payload)(url, init);
};
const retried = await generateValidatedDraft({ report, apiKey: SECRET, model: 'm', fetchImpl: flaky });
assert.equal(retried.attempts, 2);
assert.match(prompts[1], /rejected for these reasons/);
assert.match(prompts[1], /777/);
await assert.rejects(generateValidatedDraft({ report, apiKey: SECRET, model: 'm', fetchImpl: okFetch({ headline: 'x' }) }), /failed validation after 2 attempts/);

// ---- end to end run(): skip without key, dry run, save, idempotent, refuse overwrite ----
const originalFetch = global.fetch;
const logs = []; const origLog = console.log; console.log = (...a) => logs.push(a.join(' '));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-')); const cwd = process.cwd(); process.chdir(tmp);
let stored = null; const writes = [];
global.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if (u.hostname === 'generativelanguage.googleapis.com') return okFetch(good)(url, init);
  const table = u.pathname.split('/').pop();
  if (init.method === 'POST') { writes.push({ table, body: JSON.parse(init.body), prefer: init.headers.Prefer }); stored = JSON.parse(init.body); return { ok: true, status: 201, json: async () => [] }; }
  const rows = { series_weekly_movers: movers, series: shows, series_breakouts: breakouts, newsletter_drafts: stored ? [{ status: stored.status }] : [] }[table];
  return { ok: true, status: 200, json: async () => rows };
};
const env = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'service', GEMINI_API_KEY: SECRET, SITE_URL: 'https://example.test' };
try {
  assert.equal(await run([], { ...env, GEMINI_API_KEY: '' }), null);
  assert.ok(logs.some((l) => l.includes('::warning') && l.includes('GEMINI_API_KEY')));
  assert.equal(writes.length, 0);

  const dry = await run(['--dry-run'], env);
  assert.match(dry, /Show A surges/);
  assert.equal(writes.length, 0, 'dry run must not write');
  assert.ok(fs.existsSync(path.join(tmp, 'newsletter-drafts', '2026-11-16.md')));

  await run([], env);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].table, 'newsletter_drafts');
  assert.equal(writes[0].body.week_start, '2026-11-16');
  assert.equal(writes[0].body.status, 'draft');
  assert.equal(writes[0].body.facts.length, 3);

  assert.equal(await run([], env), null, 'an existing draft is not regenerated');
  assert.equal(writes.length, 1);

  stored.status = 'published';
  await assert.rejects(run(['--force'], env), /published; refusing to overwrite/);
  assert.equal(writes.length, 1);
  stored.status = 'draft';
  await run(['--force'], env);
  assert.equal(writes.length, 2);
  assert.match(writes[1].prefer, /merge-duplicates/);
  for (const line of logs) assert.ok(!line.includes(SECRET), 'secrets must never be logged');
} finally {
  console.log = origLog; global.fetch = originalFetch; process.chdir(cwd);
}
console.log('Newsletter generation tests passed.');
