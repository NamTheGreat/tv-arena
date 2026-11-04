const assert = require('node:assert/strict');
const configPath = require.resolve('../../lighthouserc.cjs');

process.env.LHCI_ENFORCE_BUDGETS = 'false';
delete require.cache[configPath];
let assertions = require('../../lighthouserc.cjs').ci.assert.assertions;
assert.deepEqual(assertions['categories:performance'], ['warn', { minScore: 0.8 }]);
assert.deepEqual(assertions['categories:accessibility'], ['warn', { minScore: 0.9 }]);
assert.deepEqual(assertions['categories:best-practices'], ['warn', { minScore: 0.9 }]);

process.env.LHCI_ENFORCE_BUDGETS = 'true';
delete require.cache[configPath];
assertions = require('../../lighthouserc.cjs').ci.assert.assertions;
assert.deepEqual(assertions['categories:performance'], ['error', { minScore: 0.8 }]);
assert.deepEqual(assertions['categories:accessibility'], ['error', { minScore: 0.9 }]);
assert.deepEqual(assertions['categories:best-practices'], ['error', { minScore: 0.9 }]);
console.log('Lighthouse warning and blocking budgets verified.');
