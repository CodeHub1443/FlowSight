import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const SCREENS = path.resolve(import.meta.dirname, '..', 'docs', 'screens');
const SIZES = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
];
// The fixture source stamps messages with Date.now(); pinning it makes the clock, dwell and ages match the
// contract fixtures (19:50 Dhaka) so screenshots are stable and comparable with the reference.
const FIXED_NOW = new Date('2026-10-24T13:50:45Z');

async function openLive(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.clock.setFixedTime(FIXED_NOW);
  await page.goto('/live');
  await expect(page.getByTestId('tray-bay-B02')).toBeVisible();
  await expect(page.getByTestId('kpi-cases')).toContainText('18,240');
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

    await page.getByTestId('tray-bay-B02').click();
    await expect(page.getByTestId('inspector-bay')).toBeVisible();
    await expect(page.getByTestId('tracker-step-loading')).toContainText('Loading 412/—');
    await expectNoOverflow(page);

    // Inspector and tray never overlap.
    const inspector = await page.getByTestId('inspector').boundingBox();
    const tray = await page.getByTestId('tray').boundingBox();
    expect((inspector?.y ?? 0) + (inspector?.height ?? 0)).toBeLessThanOrEqual(tray?.y ?? 0);

    await settle(page);
    await page.screenshot({ path: path.join(SCREENS, `step-05-live-${width}x${height}-en.png`) });

    await page.getByRole('button', { name: 'বাং' }).click();
    await expect(page.getByTestId('tracker-step-loading')).toContainText('লোডিং ৪১২/—');
    await expect(page.getByTestId('mode-clock')).toHaveText('১৯:৫০');
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
  await page.getByTestId('tray-truck-V-20261024-B02-0007').click();
  await expect(page.getByTestId('inspector-truck')).toBeVisible();
  await expect(page.getByTestId('tracker-subject')).toContainText('DHAKA METRO-DA 11-2171');
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
  await page.keyboard.press('/');
  await expect(page.getByTestId('global-search')).toBeFocused();
  await page.getByTestId('global-search').fill('২১৭১');
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
  await page.getByTestId('visit-tracker').getByRole('button', { name: 'Collapse panel' }).click();
  await expect(page.getByTestId('tracker-steps')).toHaveCount(0);
  await page.getByRole('button', { name: 'Hide KPI chips' }).click();
  await expect(page.getByTestId('kpi-cases')).toHaveCount(0);
});
