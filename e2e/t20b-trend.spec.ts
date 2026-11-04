import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { BAYS } from './mockSim';

// Task 20B: W4 throughput trend and W5 trucks over the expected time (docs/tasks/t20-spec.md section 4).
// Written in the parallel phase, NOT run in 20B (no browser). 20.9 runs it first. Mock mode: the data is simulated, so
// the checks are structural (widgets, states, order, digit scripts), never sample numbers. No simulator restart: the
// widgets query the history once and the week range is not refetched, so a restart would leave them on the old data.

const LATIN_DIGIT = /[0-9]/;

async function openPerformance(page: Page, range?: 'shift' | 'day' | 'week') {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(range && range !== 'day' ? `/analytics?range=${range}` : '/analytics');
  await expect(page.getByTestId('perf-trend-section')).toBeVisible({ timeout: 60_000 });
}

async function setLang(page: Page, lang: 'en' | 'bn') {
  await page.getByRole('button', { name: lang === 'bn' ? 'বাং' : 'EN', exact: true }).click();
}

test.describe('Performance tab: throughput trend and trucks over the expected time', () => {
  test('W4 shows two lines, a caption and an accessible data table (week)', async ({ page }) => {
    await openPerformance(page, 'week');
    const w4 = page.getByTestId('perf-w4');
    await expect(w4.getByTestId('trend-chart')).toBeVisible({ timeout: 30_000 });
    await expect(w4.locator('canvas').first()).toBeVisible();
    await expect(w4.getByTestId('trend-total-current')).toBeVisible();
    await expect(w4.getByTestId('trend-total-previous')).toBeVisible();
    // the week is per-day totals: 7 rows in the text alternative
    await expect(w4.getByTestId('chart-data-table').locator('tbody tr')).toHaveCount(7);
  });

  test('W4 day view is hourly', async ({ page }) => {
    await openPerformance(page, 'day');
    const rows = page.getByTestId('perf-w4').getByTestId('chart-data-table').locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    expect(await rows.count()).toBeGreaterThan(7);
  });

  test('W4 bay filter keeps the chart and changes the caption', async ({ page }) => {
    await openPerformance(page, 'week');
    const w4 = page.getByTestId('perf-w4');
    const before = await w4.getByTestId('trend-total-current').textContent();
    await w4.getByTestId('trend-bay-filter').selectOption('B02');
    await expect(w4.getByTestId('trend-chart')).toBeVisible();
    await expect(w4.getByTestId('trend-total-current')).not.toHaveText(before ?? '');
  });

  test('W5 has one cell per bay in bay order', async ({ page }) => {
    await openPerformance(page, 'week');
    const cells = page.getByTestId('detention-strip').getByRole('listitem');
    await expect(cells).toHaveCount(BAYS.length, { timeout: 30_000 });
    const ids = await cells.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    expect(ids).toEqual(BAYS.map((b) => `detention-${b}`));
  });

  test('both widgets render in Bangla with Bangla digits and no clipping', async ({ page }) => {
    await openPerformance(page, 'week');
    await setLang(page, 'bn');
    const w4 = page.getByTestId('perf-w4');
    await expect(w4.getByTestId('trend-total-current')).toBeVisible({ timeout: 30_000 });
    expect(await w4.getByTestId('trend-total-current').textContent()).not.toMatch(LATIN_DIGIT);
    expect(await w4.getByTestId('trend-total-previous').textContent()).not.toMatch(LATIN_DIGIT);
    const strip = page.getByTestId('detention-strip');
    await expect(strip).toBeVisible();
    expect(await strip.textContent()).not.toMatch(LATIN_DIGIT);
    // nothing wider than its card
    for (const id of ['perf-w4', 'perf-w5']) {
      const overflow = await page.getByTestId(id).evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow, `${id} overflows horizontally`).toBeLessThanOrEqual(1);
    }
    await setLang(page, 'en');
  });
});
