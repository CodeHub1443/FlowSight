import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from './fixtures';

// ADR-13 at runtime: the GLBs and their decoder come from this origin only. The fixture's guard fails the test on any
// non-local request; the CDN names are also checked by hand because they are what drei and DRACO would reach for.

const MANIFEST = path.resolve(import.meta.dirname, '..', 'public', 'models', 'manifest.json');
const CDN = /gstatic|jsdelivr|unpkg|cdnjs|googleapis/i;
const LIVE_MODELS = ['pallet_b01', 'pallet_b01_far', 'box_brown_b28', 'pallet_jack'];

test('Med tier loads the live models locally, decodes them and calls no CDN', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (req) => requested.push(req.url()));
  const failed: string[] = [];
  page.on('requestfailed', (req) => failed.push(req.url()));
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(String(e)));

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/live?quality=med');
  await expect(page.getByTestId('scene-slot').locator('canvas').first()).toBeVisible({
    timeout: 60_000,
  });

  const { assets } = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as {
    assets: Record<string, { file: string }>;
  };
  await expect
    .poll(
      () => LIVE_MODELS.every((m) => requested.some((u) => u.endsWith(assets[m]?.file ?? '?'))),
      {
        timeout: 60_000,
      },
    )
    .toBe(true);

  expect(requested.filter((u) => CDN.test(u))).toEqual([]);
  expect(failed.filter((u) => u.includes('/models/'))).toEqual([]);
  // forklift, scanner, crate and truck stay out of the live scene until step 7
  for (const dormant of ['forklift', 'scanner', 'crate', 'truck']) {
    const file = assets[dormant]?.file ?? '?';
    expect(requested.some((u) => u.endsWith(file))).toBe(false);
  }
  expect(problems).toEqual([]);
});

test('Low tier keeps procedural props and downloads no model', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (req) => requested.push(req.url()));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/live?quality=low');
  await expect(page.getByTestId('scene-slot').locator('canvas').first()).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForTimeout(3000);
  expect(requested.filter((u) => u.endsWith('.glb'))).toEqual([]);
});

test('/dev/assets does not exist in a production build', async ({ page }) => {
  await page.goto('/dev/assets');
  await expect(page.getByTestId('asset-preview')).toHaveCount(0);
  // the app's own not-found page answers
  await expect(page.getByRole('link').first()).toBeVisible({ timeout: 60_000 });
  expect(page.url()).toContain('/dev/assets');
});
