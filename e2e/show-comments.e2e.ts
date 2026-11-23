import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockSupabase } from './helpers';

test('show detail renders the discussion thread for signed-out visitors', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/show/show-1');
  const section = page.getByRole('region', { name: /Discussion/ });
  await expect(section.getByText('Test Pilot')).toBeVisible();
  await expect(section.getByText('Absolutely deserves the top spot.')).toBeVisible();
  await expect(section.getByText('🔥 5-day best streak')).toBeVisible();
  await expect(section.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(section.getByLabel('Add a comment')).toHaveCount(0);

  // Scoped to the discussion section: the rest of the show page has pre-existing stone-500 contrast findings.
  const results = await new AxeBuilder({ page }).include('#show-comments-heading').include('section[aria-labelledby="show-comments-heading"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.filter((v) => ['critical', 'serious'].includes(v.impact || ''))).toEqual([]);
});
