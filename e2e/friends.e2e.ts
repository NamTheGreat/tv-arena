import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockSupabase } from './helpers';

test('friends page asks signed-out visitors to sign in and has no serious axe findings', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/friends');
  await expect(page.getByRole('heading', { name: 'Friends', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main Navigation' }).getByRole('button', { name: 'Friends' })).toHaveCount(0);

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.filter((v) => ['critical', 'serious'].includes(v.impact || ''))).toEqual([]);
});
