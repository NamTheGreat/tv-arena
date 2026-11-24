import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockSupabase } from './helpers';

test('show page compares premieres with previous seasons', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/show/show-1');
  const card = page.getByTestId('premiere-impact');
  await expect(card).toBeVisible();
  const rows = card.getByTestId('premiere-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('3×');
  await expect(rows.nth(0)).toContainText('Biggest premiere');
  await expect(rows.nth(1)).toContainText('1.5×');
  await expect(rows.nth(1)).toContainText("0.5× the previous premiere's bump");
  const results = await new AxeBuilder({ page }).include('[data-testid="premiere-impact"]').analyze();
  expect(results.violations.filter((v) => ['critical', 'serious'].includes(v.impact || ''))).toEqual([]);
});

test('premiere card fits a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await mockSupabase(page);
  await page.goto('/show/show-1');
  await page.getByTestId('premiere-impact').waitFor();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
