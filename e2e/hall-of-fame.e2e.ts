import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockSupabase } from './helpers';

test('hall of fame lists records with dates and tie markers', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/hall-of-fame');
  await expect(page.getByRole('heading', { name: 'Hall of Fame', level: 1 })).toBeVisible();
  await expect(page.getByText('9,000 pts')).toBeVisible();
  await expect(page.getByText('Mar 5, 2026')).toBeVisible();
  await expect(page.getByText('T-2')).toHaveCount(2);
  await expect(page.getByText('4 days')).toBeVisible();
  await expect(page.getByText('No records in this category yet.').first()).toBeVisible();
});

test('hall of fame is reachable from the nav and has no serious axe findings', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main Navigation' }).getByRole('button', { name: 'Hall of Fame' }).click();
  await expect(page).toHaveURL(/\/hall-of-fame$/);
  await page.getByText('9,000 pts').waitFor();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.filter((v) => ['critical', 'serious'].includes(v.impact || ''))).toEqual([]);
});
