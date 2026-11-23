const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const headers = readFileSync('public/_headers', 'utf8');
const routes = JSON.parse(readFileSync('public/_routes.json', 'utf8'));
assert.ok(routes.include.includes('/daily/*'), 'expected daily share pages to reach Pages Functions');
assert.ok(routes.include.includes('/og/*/*'), 'expected OG image routes to reach Pages Functions');
assert.match(headers, /^\s*Content-Security-Policy-Report-Only:/m);
assert.doesNotMatch(headers, /^\s*Content-Security-Policy:/m);
for (const origin of [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://*.supabase.co',
  'wss://*.supabase.co',
  'https://challenges.cloudflare.com',
]) {
  assert.ok(headers.includes(origin), `expected CSP to allow ${origin}`);
}
assert.match(headers, /script-src 'self' https:\/\/challenges\.cloudflare\.com/);
assert.match(headers, /frame-src https:\/\/challenges\.cloudflare\.com/);
assert.ok(headers.includes('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()'));
console.log('Report-Only CSP and Permissions-Policy verified.');

// Embed widget (#189): only /embed paths may be framed by other sites.
const blocks = headers.split(/\n(?=\S)/).map((block) => block.trim()).filter(Boolean);
const globalBlock = blocks.find((block) => block.startsWith('/*'));
assert.ok(globalBlock && /^\s*X-Frame-Options: DENY/m.test(globalBlock), 'expected global X-Frame-Options: DENY');
assert.match(globalBlock, /frame-ancestors 'none'/);
for (const path of ['/embed', '/embed/*']) {
  const block = blocks.find((candidate) => candidate.split('\n')[0].trim() === path);
  assert.ok(block, `expected a header rule for ${path}`);
  assert.match(block, /^\s*! X-Frame-Options\s*$/m, `expected ${path} to detach X-Frame-Options`);
  assert.match(block, /^\s*! Content-Security-Policy-Report-Only\s*$/m, `expected ${path} to detach the frame-ancestors CSP`);
  assert.doesNotMatch(block, /^\s*X-Frame-Options:/m);
}
assert.equal((headers.match(/^\s*! X-Frame-Options\s*$/gm) || []).length, 2, 'only the two embed rules may detach X-Frame-Options');
console.log('Embed iframe header exceptions verified.');
