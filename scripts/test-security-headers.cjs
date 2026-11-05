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
]) {
  assert.ok(headers.includes(origin), `expected CSP to allow ${origin}`);
}
assert.ok(headers.includes('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()'));
console.log('Report-Only CSP and Permissions-Policy verified.');
