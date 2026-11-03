import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { beltStatuses, settle, startPeak } from './mockSim';

// Mock mode end to end: the production build runs the simulator (Web Worker) behind /live and MSW answers REST.

const SCREENS = path.resolve(import.meta.dirname, '..', 'docs', 'screens');
const KINDS = ['siteState', 'bayState', 'actors', 'case', 'event', 'lifecycle', 'health'];

/** "Trucks on site" chip: [on site, docked, waiting]. */
async function kpiTrucks(page: Page): Promise<number[]> {
  const text = (await page.getByTestId('kpi-trucks').textContent()) ?? '';
  const m = /Trucks on site\D*([\d,]+)\D*?([\d,]+) docked\D*?([\d,]+) waiting/.exec(text);
  return m ? m.slice(1).map((n) => Number(n.replaceAll(',', ''))) : [];
}

async function trucksTabCount(page: Page): Promise<number> {
  const text = (await page.getByRole('tab', { name: /Trucks/ }).textContent()) ?? '';
  return Number(/(\d+)/.exec(text)?.[1] ?? NaN);
}

async function expectNoOverflow(page: Page) {
  const { scrollWidth, innerWidth, scrollHeight, innerHeight } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  expect(scrollHeight).toBeLessThanOrEqual(innerHeight);
}

test('the simulated depot runs on /live at 60x (evening peak, seed 1)', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/live');
  await expect(page.getByTestId('tray-bay-B01')).toBeVisible({ timeout: 60_000 });
  await startPeak(page, { speed: 60, keepPanel: true });

  // At most 30 s of wall time at 60x (= 30 simulated minutes).
  const started = Date.now();
  const before = await beltStatuses(page);
  await expect
    .poll(async () => (await beltStatuses(page)).some((s, i) => s !== before[i]), {
      timeout: 30_000,
    })
    .toBe(true);

  // KPI chips carry a real (non-null) SiteState: cases and the truck split are numbers.
  await expect(page.getByTestId('kpi-cases')).toHaveText(/Cartons today\D*\d/);
  // "Trucks n" in the tray counts docked + queued trucks, so it matches the KPI chip (no step-05 mismatch).
  await expect
    .poll(
      async () => {
        const [onSite, docked, waiting] = await kpiTrucks(page);
        return onSite === (docked ?? 0) + (waiting ?? 0) && onSite === (await trucksTabCount(page));
      },
      { timeout: Math.max(5_000, 30_000 - (Date.now() - started)) },
    )
    .toBe(true);

  await page.getByRole('tab', { name: /Trucks/ }).click();
  await expect(page.locator('[data-testid^="tray-truck-V-20261024-"]').first()).toBeVisible();

  for (const kind of KINDS) {
    await expect(page.getByTestId(`debug-dropped-${kind}`)).toHaveText('0');
  }
  await expect(page.getByTestId('debug-received-case')).not.toHaveText('0');
  expect(Date.now() - started).toBeLessThan(30_000);
});

test('/live mid-peak screenshots, EN and BN', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/live');
  await expect(page.getByTestId('scene-slot').locator('canvas')).toHaveCount(1, {
    timeout: 60_000,
  });
  // Run 20 simulated minutes into the peak at 60x, then slow to 1x so the EN and BN shots show the same moment.
  await startPeak(page, { speed: 60, keepPanel: true });
  await page.waitForTimeout(20_000);
  await page.getByRole('region', { name: 'Simulator' }).getByRole('button', { name: '1×' }).click();
  await page.keyboard.press('Control+Shift+D');

  // Show the Trucks tab, and a queued truck in the tracker when there is one.
  await page.getByRole('tab', { name: /Trucks/ }).click();
  const rows = page.locator('[data-testid^="tray-truck-V-"]');
  await expect(rows.first()).toBeVisible();
  const queued = rows.filter({ hasText: 'Waiting' });
  await ((await queued.count()) > 0 ? queued.first() : rows.first()).click();
  await expect(page.getByTestId('tracker-steps')).toBeVisible();

  for (const { width, height } of [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
  ]) {
    await page.setViewportSize({ width, height });
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await expectNoOverflow(page);
    await settle(page, 1500);
    await page.screenshot({
      path: path.join(SCREENS, `step-merge-02-live-${width}x${height}-en.png`),
    });
    await page.getByRole('button', { name: 'বাং' }).click();
    await expect(page.getByTestId('mode-clock')).toHaveText(/^[০-৯]{2}:[০-৯]{2}$/);
    await expectNoOverflow(page);
    await settle(page, 1500);
    await page.screenshot({
      path: path.join(SCREENS, `step-merge-02-live-${width}x${height}-bn.png`),
    });
  }
});
