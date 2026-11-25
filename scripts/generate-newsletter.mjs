import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPostgrestRows } from './lib/fetchPostgrestRows.mjs';
import { buildFacts, DEFAULT_MODEL, generateValidatedDraft, renderMarkdown } from './lib/newsletter.mjs';

function parseArgs(argv) {
  const args = { force: false, dryRun: false, week: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--force') args.force = true;
    else if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--week') args.week = argv[++i];
  }
  if (args.week && !/^\d{4}-\d{2}-\d{2}$/.test(args.week)) throw new Error('--week must be YYYY-MM-DD (a Monday)');
  return args;
}

async function postgrest(baseUrl, key, pathAndQuery, init = {}) {
  const response = await fetch(new URL(`rest/v1/${pathAndQuery}`, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`), {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', ...(init.headers || {}) },
  });
  if (!response.ok) throw new Error(`${pathAndQuery.split('?')[0]} returned HTTP ${response.status}`);
  return response;
}

export async function run(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('::warning title=Newsletter skipped::GEMINI_API_KEY is not configured; no draft generated.');
    return null;
  }
  const baseUrl = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  const siteUrl = env.SITE_URL || 'https://tv-arena.pages.dev';

  const movers = await fetchPostgrestRows(baseUrl, key, 'series_weekly_movers',
    'period_start,series_id,slug,title,network,current_7d_score,previous_7d_score,delta_pct,mover_rank,faller_rank',
    { order: 'period_start.desc,mover_rank.asc', pageSize: 1000, filter: args.week ? ['period_start', `eq.${args.week}`] : undefined });
  const week = args.week || movers.reduce((latest, m) => (m.period_start > latest ? m.period_start : latest), '');
  if (!week) { console.log('No completed movers week found; nothing to draft.'); return null; }

  if (!args.force && !args.dryRun) {
    const existing = await (await postgrest(baseUrl, key, `newsletter_drafts?select=status&week_start=eq.${week}`)).json();
    if (existing.length) { console.log(`A ${existing[0].status} newsletter for ${week} already exists; skipping (use --force to replace a draft).`); return null; }
  }

  const [shows, breakouts] = await Promise.all([
    fetchPostgrestRows(baseUrl, key, 'series', 'id,slug,title', { order: 'id.asc' }),
    fetchPostgrestRows(baseUrl, key, 'series_breakouts', 'series_id,detected_date,signal,reason,pct_over_baseline', {
      order: 'detected_date.desc', pageSize: 500, filter: ['detected_date', `gte.${week}`],
    }),
  ]);
  const report = buildFacts({ movers, shows, breakouts, weekStart: week, siteUrl });
  if (!report) { console.log(`No risers or fallers for ${week}; nothing to draft.`); return null; }
  console.log(`Drafting newsletter for ${report.week_start}: ${report.facts.length} facts, model ${model}.`);

  const { draft, attempts } = await generateValidatedDraft({ report, apiKey, model });
  const markdown = renderMarkdown(draft, report, { model });
  console.log(`Draft validated after ${attempts} attempt(s), ${markdown.length} characters.`);

  const outDir = path.join(process.cwd(), 'newsletter-drafts');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${week}.md`), markdown, 'utf8');

  if (args.dryRun) { console.log('Dry run: draft written to newsletter-drafts/ and not saved to the database.'); return markdown; }

  const row = { week_start: week, markdown, facts: report.facts, model, status: 'draft', updated_at: new Date().toISOString() };
  if (args.force) {
    const existing = await (await postgrest(baseUrl, key, `newsletter_drafts?select=status&week_start=eq.${week}`)).json();
    if (existing[0]?.status === 'published') throw new Error(`The newsletter for ${week} is published; refusing to overwrite it.`);
    await postgrest(baseUrl, key, 'newsletter_drafts?on_conflict=week_start', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
  } else {
    await postgrest(baseUrl, key, 'newsletter_drafts', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
  }
  console.log(`Saved draft for ${week} to newsletter_drafts.`);
  return markdown;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  run().catch((error) => {
    console.error(`::error title=Newsletter generation failed::${error.message}`);
    process.exitCode = 1;
  });
}
