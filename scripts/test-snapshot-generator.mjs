import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const snapshotPath = resolve(root, 'public/snapshot.json');
const csvPath = resolve(root, 'public/snapshot.csv');
const data = {
  series_leaderboard: [{
    id: 'series-1', tmdb_id: 1, slug: 'show-one', title: 'Show One', network: 'Network One',
    network_group: 'Network One', genre_group: 'Drama', release_years: '2024–2025', chart_color: '#ffffff', current_7d_score: 125,
    previous_7d_score: 100, delta_pct: 25, rank: 1,
  }],
  series: [{
    id: 'series-1', tmdb_id: 1, slug: 'show-one', title: 'Show One', network: 'Network One',
    network_group: 'Network One', genre_group: 'Drama', release_years: '2024–2025', chart_color: '#ffffff', wiki_slug: 'Show_One',
    reddit_query: 'Show One', updated_at: null,
  }],
  series_recent_telemetry: [{ series_id: 'series-1', daily_series: [100, 125], daily_dates: ['2026-11-03', '2026-11-04'] }],
  series_events: [],
  series_breakouts: [],
};

const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const table = url.pathname.split('/').pop();
  const select = url.searchParams.get('select') || '';
  if (table === 'series_leaderboard' || table === 'series') {
    assert(select.split(',').includes('network_group'), `${table} select must include network_group`);
  }
  const rangeHeader = request.headers['range'] || '';
  if (rangeHeader.startsWith('1000-')) {
    response.writeHead(416, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ message: 'Requested range not satisfiable' }));
    return;
  }
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(data[table] || []));
});

await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
try {
  const port = server.address().port;
  const child = spawn(process.execPath, [resolve(root, 'scripts/generate-snapshot.mjs')], {
    cwd: root,
    env: {
      ...process.env,
      SUPABASE_URL: `http://127.0.0.1:${port}`,
      SUPABASE_ANON_KEY: 'test-anon-key',
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
    stdio: 'inherit',
  });
  const exitCode = await new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', resolveExit);
  });
  assert.equal(exitCode, 0, 'snapshot generator exits successfully');

  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
  assert.equal(snapshot.series.length, 1);
  assert.equal(snapshot.series[0].network_group, 'Network One');
  assert.equal(snapshot.series[0].buzz_score, 125);
  assert.deepEqual(snapshot.series[0].daily_series, [100, 125]);
  assert.deepEqual(snapshot.series[0].daily_dates, ['2026-11-03', '2026-11-04']);
  const csvContent = await readFile(csvPath, 'utf8');
  assert.match(csvContent, /Show One/);
  assert.match(csvContent, /Network One/);
  console.log('Snapshot JSON and CSV generation tests passed.');
} finally {
  await Promise.all([rm(snapshotPath, { force: true }), rm(csvPath, { force: true })]);
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
}
