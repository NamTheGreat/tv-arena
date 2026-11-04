import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockSupabase } from './helpers';

for (const path of ['/', '/arena/show-1/show-2', '/charts', '/guess']) {
  test(`has no serious axe findings on ${path}`, async ({ page }) => {
    await mockSupabase(page);
    await page.goto(path);
    await page.locator('body > #root > div').waitFor();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const seriousViolations = results.violations
      .filter((violation) => ['critical', 'serious'].includes(violation.impact || ''))
      .map(({ id, nodes }) => ({ id, elements: nodes.map(({ html, failureSummary }) => ({ html, failureSummary })) }));
    expect(seriousViolations).toEqual([]);
  });
}
