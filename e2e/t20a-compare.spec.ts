import { expect, test } from './fixtures';
import { settle, startPeak } from './mockSim';

// Task 20A: bay comparison widgets W1, W2, W3 (docs/tasks/t20-spec.md section 4). Written in the parallel phase, NOT run
// there (no browser in 20A); 20.9 runs it first. Mock mode: the data is simulated, so the checks are structural
// (rows, order, labels, digit scripts), never sample numbers. `week` is the populated range in the mock.

const BAY_IDS = ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07'];

async function openWeek(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/analytics?range=week');
  await expect(page.getByTestId('perf-index-section')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('w1-rows')).toBeVisible({ timeout: 60_000 });
  await settle(page);
}

test('W1 to W3 list the seven bays in bay order, EN', async ({ page }) => {
  await openWeek(page);
  const w1 = await page
    .locator('[data-testid^="w1-row-B"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')?.slice(-3)));
  expect(w1).toEqual(BAY_IDS);
  const w3 = await page
    .locator('[data-testid^="w3-row-B"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')?.slice(-3)));
  expect(w3).toEqual(BAY_IDS);
  // W2 is a chart: its text alternative lists the bays in order
  const w2 = page.getByTestId('w2-chart');
  await expect(w2.getByRole('img')).toBeVisible();
  const heads = await w2.getByTestId('chart-data-table').getByRole('rowheader').allTextContents();
  expect(heads).toEqual(BAY_IDS.map((_, i) => `Bay ${i + 1}`));
});

test('W1 rows carry a bar, the visits count and the how-calculated popover', async ({ page }) => {
  await openWeek(page);
  await expect(page.getByTestId('w1-band').first()).toBeVisible();
  await expect(page.getByTestId('w1-visits-B01')).toContainText('visit');
  await page.getByRole('button', { name: 'How this is calculated' }).click();
  await expect(page.getByTestId('w1-how-content')).toContainText('same direction, pack type');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('w1-how-content')).toBeHidden();
});

test('W3 never says "per worker" and is not sortable', async ({ page }) => {
  await openWeek(page);
  const text = (await page.getByTestId('w3-table').textContent()) ?? '';
  expect(text).toContain('per crew member present');
  expect(text.toLowerCase()).not.toContain('per worker');
  // a value column of W3 itself (20.9: the trend section is now above, and its charts' hidden data tables come first)
  await page.getByTestId('w3-table').getByRole('columnheader').nth(1).click();
  const order = await page
    .locator('[data-testid^="w3-row-B"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')?.slice(-3)));
  expect(order).toEqual(BAY_IDS);
});

test('insufficient W1 offers "Show last 7 days", which sets the range to week', async ({
  page,
}) => {
  // Deterministic sparse range (20.9): the peak day (seed 1, 2026-10-24 19:20) has fewer than 4 comparable trucks per
  // bay on the 14:00 shift, so every bay is NONE (docs/progress/t20-0.md). The simulator restarts from a placeholder tab
  // that runs no analytics query; Performance then opens by a client-side click, so its query runs on the peak data.
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/analytics/throughput?range=shift');
  const perfTab = page.locator('a[data-tab="performance"]');
  await expect(perfTab).toBeVisible({ timeout: 60_000 });
  await startPeak(page);
  await perfTab.click();
  const w1 = page.getByTestId('perf-w1');
  await expect(w1.getByTestId('widget-insufficient')).toContainText(
    'comparable trucks in this range',
    { timeout: 60_000 },
  );
  const button = page.getByTestId('w1-show-week');
  await expect(button).toBeVisible();
  await button.click();
  await expect(page).toHaveURL(/range=week/);
  await expect(page.getByTestId('w1-rows')).toBeVisible({ timeout: 60_000 });
  // hidden when the range is already week
  await expect(page.getByTestId('w1-show-week')).toHaveCount(0);
});

test('Bangla: digits and bay labels in W1 to W3', async ({ page }) => {
  await openWeek(page);
  await page.getByRole('button', { name: 'বাং' }).click();
  await settle(page);
  const index = (await page.getByTestId('w1-index-B01').textContent()) ?? '';
  expect(index).not.toMatch(/[0-9]/);
  await expect(page.getByTestId('w1-visits-B01')).toContainText(/[০-৯]/);
  await expect(page.getByTestId('w3-row-B01')).toContainText('বে ১');
});

test('no horizontal overflow at 1366 and 1920', async ({ page }) => {
  for (const width of [1366, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/analytics?range=week');
    await expect(page.getByTestId('w1-rows')).toBeVisible({ timeout: 60_000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  }
});
