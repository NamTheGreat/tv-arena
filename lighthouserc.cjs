// TODO: After one week of preview reports, set the LHCI_ENFORCE_BUDGETS repository variable to true.
const enforceBudgets = process.env.LHCI_ENFORCE_BUDGETS === 'true';
const level = enforceBudgets ? 'error' : 'warn';

module.exports = {
  ci: {
    collect: { numberOfRuns: 3 },
    assert: {
      assertions: {
        'categories:performance': [level, { minScore: 0.8 }],
        'categories:accessibility': [level, { minScore: 0.9 }],
        'categories:best-practices': [level, { minScore: 0.9 }],
      },
    },
    upload: { target: 'temporary-public-storage' },
  },
};
