import { expect, test } from '@playwright/test';
import { mockSupabase, shows } from './helpers';

test.beforeEach(async ({ page }) => mockSupabase(page));

test('renders a deep linked show page', async ({ page }) => {
  await page.goto('/show/show-1');
  await expect(page.getByRole('heading', { name: 'Show 1', level: 1 })).toBeVisible();
});

test('keeps arena deep links and browser history in sync', async ({ page }) => {
  await page.goto('/');
  await page.goto(`/arena/${shows[0].slug}/${shows[1].slug}`);
  await expect(page.getByRole('heading', { name: 'Show 1' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Show 2' }).first()).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL('/');
  await page.goForward();
  await expect(page).toHaveURL(`/arena/${shows[0].slug}/${shows[1].slug}`);
});

test('copies the current arena link', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`/arena/${shows[0].slug}/${shows[1].slug}`);
  await page.getByRole('button', { name: 'Copy Link' }).click();
  await expect(page.getByText('Copied!')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
});

test('completes a mocked daily run and stores all ten answers', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-04T23:59:00.000Z') });
  await page.goto('/guess/daily');
  await page.getByRole('button', { name: /Daily Run/ }).click();
  await expect(page.getByRole('heading', { name: 'Show 1' })).toBeVisible();

  for (let round = 0; round < 10; round += 1) {
    await page.getByRole('button', { name: /Higher/ }).click();
    await expect(page.getByText('Correct!')).toBeVisible();
    await page.getByRole('button', { name: round === 9 ? /Complete Run/ : /Next Round/ }).click();
    if (round === 8) await page.clock.setFixedTime(new Date('2026-11-05T00:01:00.000Z'));
  }

  await expect(page.getByRole('heading', { name: "Today's Challenge Complete" })).toBeVisible();
  const saved = await page.evaluate(() => localStorage.getItem('tv_arena_daily_2026-11-04'));
  expect(JSON.parse(saved || 'null')).toMatchObject({ date: '2026-11-04', answers: Array(10).fill('higher') });
});

test('submits every answer from a short daily deck', async ({ page }) => {
  await page.unrouteAll();
  await mockSupabase(page, 4);
  await page.goto('/guess/daily');
  await page.getByRole('button', { name: /Daily Run/ }).click();

  for (let round = 0; round < 3; round += 1) {
    await page.getByRole('button', { name: /Higher/ }).click();
    await expect(page.getByText('Correct!')).toBeVisible();
    await page.getByRole('button', { name: 'Next Round' }).click();
  }

  await expect(page.getByRole('heading', { name: "Today's Challenge Complete" })).toBeVisible();
  const saved = await page.evaluate(() => localStorage.getItem(`tv_arena_daily_${new Date().toISOString().slice(0, 10)}`));
  expect(JSON.parse(saved || 'null').answers).toHaveLength(3);
});
