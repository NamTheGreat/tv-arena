import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockSupabase } from './helpers';

test('insights renders macro charts and the correlation explorer', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/insights');
  await expect(page.getByRole('heading', { name: 'Market Insights', level: 1 })).toBeVisible();
  await expect(page.getByText('32% of shows (32/100)')).toBeVisible();
  await expect(page.getByTestId('line-chart')).toHaveCount(2);
  await expect(page.getByTestId('scatter-chart')).toBeVisible();
  await expect(page.getByTestId('trendline')).toBeVisible();
  await expect(page.getByTestId('metric-n')).toHaveText('12');
  const r2 = Number(await page.getByTestId('metric-r2').textContent());
  expect(r2).toBeGreaterThan(0.8);

  await page.getByLabel('Y axis').selectOption('avg_reddit_upvotes');
  await expect(page.getByTestId('metric-r2')).toHaveText(/^\d\.\d{3}$/);
  await page.getByLabel('Log scale').uncheck();
  await expect(page.getByTestId('metric-n')).toHaveText('12');
});

test('insights is reachable from the nav and has no serious axe findings', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main Navigation' }).getByRole('button', { name: 'Insights' }).click();
  await expect(page).toHaveURL(/\/insights$/);
  await page.getByTestId('scatter-chart').waitFor();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.filter((v) => ['critical', 'serious'].includes(v.impact || ''))).toEqual([]);
});

for (const viewport of [
  { name: 'phone', width: 375, height: 800 },
  { name: 'tablet', width: 768, height: 1000 },
  { name: 'desktop', width: 1280, height: 900 },
]) {
  test(`insights layout fits a ${viewport.name} viewport without horizontal scrolling`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mockSupabase(page);
    await page.goto('/insights');
    await page.getByTestId('scatter-chart').waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    for (const id of ['line-chart', 'scatter-chart']) {
      const boxes = await page.getByTestId(id).evaluateAll((els) => els.map((el) => el.getBoundingClientRect()));
      for (const box of boxes) {
        expect(box.width).toBeGreaterThan(0);
        expect(box.right).toBeLessThanOrEqual(viewport.width + 1);
        // charts keep their 640:260 aspect ratio as they scale
        expect(box.width / box.height).toBeGreaterThan(2.3);
        expect(box.width / box.height).toBeLessThan(2.6);
      }
    }
  });
}
