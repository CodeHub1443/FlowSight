import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { startPeak } from './mockSim';

const SCREENS = path.resolve(import.meta.dirname, '..', 'docs', 'screens');
const SIZES = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
];
// Mock mode runs the simulator: data is generated, so the checks are structural. Every test restarts it on the
// fixed evening-peak day (seed 1) at 1x so there are trucks, crews and open alerts.
async function openLive(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('/live');
  await expect(page.getByTestId('tray-bay-B02')).toBeVisible({ timeout: 60_000 });
  await startPeak(page);
  await expect(page.getByTestId('kpi-cases')).toHaveText(/Cases today\D*\d/);
}

/** A bay whose belt is running loaded (a truck loading or unloading): its tray row. */
async function loadingBayRow(page: Page) {
  const row = page
    .locator('[data-testid^="tray-bay-B"]')
    .filter({ hasText: 'Running loaded' })
    .first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  return row;
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}

/** No horizontal page scroll, and no card is clipped by the viewport. */
async function expectNoOverflow(page: Page) {
  const { scrollWidth, innerWidth, scrollHeight, innerHeight } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  expect(scrollHeight).toBeLessThanOrEqual(innerHeight);
  for (const id of ['visit-tracker', 'tray', 'kpi-chips']) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box, id).not.toBeNull();
    expect((box?.x ?? -1) >= 0 && (box?.y ?? -1) >= 0).toBe(true);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(innerWidth);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(innerHeight + 1);
  }
}

for (const { width, height } of SIZES) {
  test(`/live chrome at ${width}x${height}, EN then BN`, async ({ page }) => {
    await openLive(page, width, height);

    // Requirement 6: the centre of the screen belongs to the scene slot, and the overlay layer lets clicks through.
    const centreHit = await page.evaluate(() => {
      const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      return el?.closest('[data-testid="scene-slot"]') !== null;
    });
    expect(centreHit).toBe(true);
    await expect(page.getByTestId('scene-slot').locator('canvas')).toHaveCount(1, {
      timeout: 60_000,
    });

    await (await loadingBayRow(page)).click();
    await expect(page.getByTestId('inspector-bay')).toBeVisible();
    await expect(page.getByTestId('tracker-step-loading')).toHaveAttribute('data-state', 'current');
    await expect(page.getByTestId('tracker-step-loading')).toContainText(
      /(Loading|Unloading) [\d,]+\/—/,
    );
    await expectNoOverflow(page);

    // Inspector and tray never overlap.
    const inspector = await page.getByTestId('inspector').boundingBox();
    const tray = await page.getByTestId('tray').boundingBox();
    expect((inspector?.y ?? 0) + (inspector?.height ?? 0)).toBeLessThanOrEqual(tray?.y ?? 0);

    await settle(page);
    await page.screenshot({ path: path.join(SCREENS, `step-05-live-${width}x${height}-en.png`) });

    await page.getByRole('button', { name: 'বাং' }).click();
    await expect(page.getByTestId('tracker-step-loading')).toContainText(
      /(লোডিং|আনলোডিং) [০-৯,]+\/—/,
    );
    await expect(page.getByTestId('mode-clock')).toHaveText(/^[০-৯]{2}:[০-৯]{2}$/);
    await expectNoOverflow(page);
    await settle(page);
    await page.screenshot({ path: path.join(SCREENS, `step-05-live-${width}x${height}-bn.png`) });
  });
}

test('/live dark theme, truck selection and the Trucks tab', async ({ page }) => {
  await openLive(page, 1920, 1080);
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('tab', { name: /Trucks/ }).click();
  const truck = page.locator('[data-testid^="tray-truck-V-20261024-"]').first();
  const plateEn = /DHAKA METRO-\S+ \d{2}-\d{4}/.exec((await truck.textContent()) ?? '')?.[0] ?? '';
  expect(plateEn).not.toBe('');
  await truck.click();
  await expect(page.getByTestId('inspector-truck')).toBeVisible();
  await expect(page.getByTestId('tracker-subject')).toContainText(plateEn);
  await settle(page);
  await page.screenshot({ path: path.join(SCREENS, 'step-05-live-1920x1080-dark-truck.png') });
});

test('/live event inspector with evidence area, and the alert bell', async ({ page }) => {
  await openLive(page, 1366, 768);
  await page.getByTestId('alert-bell').click();
  const item = page.locator('[data-testid^="bell-alert-"]').first();
  await expect(item).toBeVisible();
  await settle(page);
  await page.screenshot({ path: path.join(SCREENS, 'step-05-live-1366x768-bell.png') });
  await item.click();
  await expect(page.getByTestId('inspector-event')).toBeVisible();
  await expect(page.getByTestId('evidence-thumb')).toBeVisible();
  await settle(page);
  await page.screenshot({ path: path.join(SCREENS, 'step-05-live-1366x768-event.png') });
});

test('/live search finds a truck by Bangla digits and selects it', async ({ page }) => {
  await openLive(page, 1366, 768);
  await page.getByRole('tab', { name: /Trucks/ }).click();
  const title = (await page.locator('[data-testid^="tray-truck-V-"]').first().textContent()) ?? '';
  const digits = /([০-৯]{4})/.exec(title)?.[1] ?? '';
  expect(digits).not.toBe('');
  await page.keyboard.press('/');
  await expect(page.getByTestId('global-search')).toBeFocused();
  await page.getByTestId('global-search').fill(digits);
  await expect(page.getByTestId('search-results')).toBeVisible();
  await settle(page);
  await page.screenshot({ path: path.join(SCREENS, 'step-05-live-1366x768-search.png') });
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('inspector-truck')).toBeVisible();
});

test('/live panels collapse', async ({ page }) => {
  await openLive(page, 1366, 768);
  await page.getByTestId('tray').getByRole('button', { name: 'Collapse panel' }).click();
  await expect(page.getByTestId('tray-bay-B02')).toHaveCount(0);
  // the visit tracker starts as a compact bar; it opens and closes on its chevron
  const tracker = page.getByTestId('visit-tracker');
  await expect(page.getByTestId('tracker-steps')).toBeHidden();
  await tracker.getByRole('button', { name: 'Expand panel' }).click();
  await expect(page.getByTestId('tracker-steps')).toBeVisible();
  await tracker.getByRole('button', { name: 'Collapse panel' }).click();
  await expect(page.getByTestId('tracker-steps')).toBeHidden();
  await page.getByRole('button', { name: 'Hide KPI chips' }).click();
  await expect(page.getByTestId('kpi-cases')).toHaveCount(0);
});
