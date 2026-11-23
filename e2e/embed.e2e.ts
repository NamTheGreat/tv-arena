import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockSupabase } from './helpers';

test.beforeEach(async ({ page }) => mockSupabase(page));

test('renders the default top five without app chrome', async ({ page }) => {
  await page.goto('/embed');
  const rows = page.getByRole('list', { name: /top shows/i }).getByRole('listitem');
  await expect(rows).toHaveCount(5);
  await expect(rows.first().getByRole('link', { name: 'Show 11' })).toBeVisible();
  await expect(rows.first().getByTestId('embed-sparkline')).toBeVisible();
  await expect(rows.first()).toContainText('1K');
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(page.getByText('Global TV Engagement Intelligence')).toHaveCount(0);
  const attribution = page.getByRole('link', { name: 'TV Arena' });
  await expect(attribution).toHaveAttribute('href', '/');
  await expect(attribution).toHaveAttribute('target', '_blank');
});

test('supports /embed/top5 and /embed/leaderboard aliases with limit, genre and platform', async ({ page }) => {
  await page.goto('/embed/top5?limit=3');
  await expect(page.getByRole('listitem')).toHaveCount(3);

  await page.goto('/embed/leaderboard?limit=2&genre=drama&platform=network');
  await expect(page.getByRole('listitem')).toHaveCount(2);

  await page.goto('/embed?genre=Comedy');
  await expect(page.getByText('No shows match this filter.')).toBeVisible();

  await page.goto('/embed?limit=999');
  await expect(page.getByRole('listitem')).toHaveCount(10);
});

test('deep link works inside a cross-origin iframe', async ({ page }) => {
  await page.setContent('<iframe title="tv-arena" src="http://127.0.0.1:4173/embed?limit=2" width="420" height="240"></iframe>');
  const frame = page.frameLocator('iframe[title="tv-arena"]');
  await expect(frame.getByRole('listitem')).toHaveCount(2);
  await expect(frame.getByRole('link', { name: 'Show 11' })).toBeVisible();
});

test('has no serious axe findings', async ({ page }) => {
  await page.goto('/embed');
  await page.getByRole('listitem').first().waitFor();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = results.violations
    .filter((violation) => ['critical', 'serious'].includes(violation.impact || ''))
    .map(({ id, nodes }) => ({ id, elements: nodes.map(({ html }) => html) }));
  expect(serious).toEqual([]);
});
