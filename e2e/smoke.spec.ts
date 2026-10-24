import path from 'node:path';
import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

const SCREENS = path.resolve(import.meta.dirname, '..', 'docs', 'screens');
const SIZES = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
];

/** Wait for web fonts and the button colour transition before capturing. */
async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

for (const { width, height } of SIZES) {
  test(`shell renders and toggles language at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page).toHaveURL(/\/live$/);

    const sample = page.getByTestId('sample-string');
    await expect(sample).toHaveText('Dhaka Central Depot');
    await settle(page);
    await page.screenshot({ path: path.join(SCREENS, `step-01-${width}x${height}.png`) });

    await page.getByRole('button', { name: 'বাং' }).click();
    await expect(sample).toHaveText('ঢাকা সেন্ট্রাল ডিপো');
    await settle(page);
    await page.screenshot({ path: path.join(SCREENS, `step-01-${width}x${height}-bn.png`) });
  });
}

test('unknown path shows 404 and admin child resolves', async ({ page }) => {
  await page.goto('/does/not/exist');
  await expect(page.getByTestId('not-found-title')).toBeVisible();
  await page.goto('/admin/alert-rules');
  await expect(page.getByTestId('placeholder-path').first()).toHaveText('/admin/alert-rules');
  await expect(page.getByTestId('placeholder-title')).toHaveCount(2);
});
