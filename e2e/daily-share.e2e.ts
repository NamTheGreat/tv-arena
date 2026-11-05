import { expect, test } from '@playwright/test';
import { mockSupabase } from './helpers';

test('renders an anonymous shared result as unverified', async ({ page }) => {
  await page.goto('/daily/1?g=1101110110');

  await expect(page.getByRole('heading', { name: 'Daily Run #1' })).toBeVisible();
  await expect(page.getByText('Score: 7/10')).toBeVisible();
  await expect(page.getByText('Shared from a device; not server-verified.')).toBeVisible();
});

test('renders a signed-in shared result from its server token', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/daily/1?s=123e4567-e89b-42d3-a456-426614174000');

  await expect(page.getByRole('heading', { name: 'Daily Run #1' })).toBeVisible();
  await expect(page.getByText('Score: 7/10')).toBeVisible();
  await expect(page.getByText('Verified server result.')).toBeVisible();
});

test('rejects malformed anonymous share grids', async ({ page }) => {
  await page.goto('/daily/1?g=111');

  await expect(page.getByRole('alert')).toHaveText('This shared result is invalid or no longer available.');
});
