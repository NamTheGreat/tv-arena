const assert = require('node:assert/strict');
const { isConventionalTitle } = require('./check_pr_title.cjs');

for (const title of [
  'feat: add weekly RSS feed',
  'fix(auth): validate username',
  'ci(lighthouse)!: update performance budget',
  'security: add report-only CSP',
]) {
  assert.equal(isConventionalTitle(title), true, title);
}

for (const title of ['Add a feature', 'fix: ', 'FEAT: uppercase type', 'feat(scope with space): invalid']) {
  assert.equal(isConventionalTitle(title), false, title);
}

console.log('Conventional PR title tests passed.');
