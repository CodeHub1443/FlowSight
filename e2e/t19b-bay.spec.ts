import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { settle, startPeak } from './mockSim';

// Task 19B: bay inspector operational panel (docs/tasks/t19-spec.md section 5B).
// Written in the parallel phase, run first in 19.9 (no browser in 19B). Mock mode: the data is simulated, so the checks
// are structural (sections, order, labels, digit scripts), never sample numbers.

// order per 19.9b decision D2
const SECTIONS: readonly string[] = [
  'bay-truck',
  'bay-timeline',
  'bay-throughput',
  'bay-workforce',
  'bay-status',
  'bay-more',
];

/**
 * 19.9b (D2): the whole truck timeline lies inside the inspector's visible scroll area without scrolling. Returns the
 * shortfall in px (0 when it fits) so a failure says by how much.
 */
async function timelineShortfall(page: Page): Promise<number> {
  return page.getByTestId('bay-timeline').evaluate((el) => {
    let scroller: HTMLElement | null = el.parentElement;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY))
      scroller = scroller.parentElement;
    if (!scroller) return 0;
    // "without scrolling": measure from the top (a click on the More details chevron scrolls it into view)
    scroller.scrollTop = 0;
    const box = scroller.getBoundingClientRect();
    const tl = el.getBoundingClientRect();
    return Math.max(0, Math.ceil(tl.bottom - box.bottom));
  });
}

async function openLive(page: Page, speed: 1 | 10 = 1) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/live');
  await expect(page.getByTestId('tray-bay-B02')).toBeVisible({ timeout: 60_000 });
  await startPeak(page, { speed });
}

/** Open the inspector on the first bay whose tray row matches `text`. */
async function selectBay(page: Page, text: string | RegExp) {
  const row = page.locator('[data-testid^="tray-bay-B"]').filter({ hasText: text }).first();
  await expect(row).toBeVisible({ timeout: 120_000 });
  await row.click();
  await expect(page.getByTestId('inspector-bay')).toBeVisible();
}

/** The section test ids inside the bay inspector, in DOM order. */
async function sectionOrder(page: Page): Promise<string[]> {
  return page.getByTestId('inspector-bay').evaluate(
    (el, ids) =>
      Array.from(el.querySelectorAll('[data-testid]'))
        .map((e) => e.getAttribute('data-testid') ?? '')
        .filter((id) => ids.includes(id)),
    [...SECTIONS],
  );
}

test('loading truck: timeline, throughput, workforce, collapsed More details, EN then BN', async ({
  page,
}) => {
  await openLive(page);
  await selectBay(page, 'Running loaded');
  const inspector = page.getByTestId('inspector-bay');

  expect(await sectionOrder(page)).toEqual([...SECTIONS]);
  expect(await timelineShortfall(page), 'timeline below the fold at 1366x768 (EN), px').toBe(0);

  // 1. Truck timeline: the bar, three phase rows, the work phase running "so far", bay occupancy so far.
  const timeline = page.getByTestId('bay-timeline');
  await expect(timeline).toContainText('Truck timeline');
  await expect(page.getByTestId('bay-timeline-bar')).toBeVisible();
  await expect(timeline).toContainText('Pre-operation delay');
  await expect(timeline).toContainText(/Loading|Unloading/);
  await expect(timeline).toContainText('Post-operation delay');
  await expect(page.getByTestId('bay-seg-work')).toHaveAttribute('data-in-progress', 'true');
  await expect(page.getByTestId('bay-seg-work')).toHaveText(/^(\d+h )?\d+m so far$/);
  await expect(page.getByTestId('bay-occupancy')).toHaveText(/^(\d+h )?\d+m so far$/);

  // 2. Throughput: cartons this visit and cartons/min.
  const throughput = page.getByTestId('bay-throughput');
  await expect(throughput).toContainText('Cartons this visit');
  await expect(page.getByTestId('bay-visit-cartons')).toHaveText(/^[\d,]+( \/ [\d,]+)?$/);
  await expect(page.getByTestId('bay-rate')).toHaveText(/^[\d.]+$/);
  await expect(throughput).toContainText(/[\d,]+ out · [\d,]+ in/);

  // 3. Workforce: counts and Yes/No only.
  await expect(page.getByTestId('bay-workers')).toHaveText(/^\d+$/);
  await expect(page.getByTestId('bay-storekeeper')).toHaveText(/^(Yes|No)$/);
  await expect(page.getByTestId('bay-forklift-op')).toHaveText(/^(Yes|No)$/);

  // 4. More details: collapsed by default, opens on its chevron.
  const more = page.getByTestId('bay-more');
  await expect(more).toContainText('More details');
  await expect(page.getByTestId('bay-more-body')).toHaveCount(0);
  const toggle = more.getByRole('button', { name: 'Show more details' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(page.getByTestId('bay-more-body')).toContainText('Pallets waiting');
  await expect(page.getByTestId('bay-more-body')).toContainText('SKUs detected');

  // Privacy: never idle or phone time.
  await expect(inspector).not.toContainText(/phone|idle/i);

  // Bangla: the same sections, Bangla labels and digits.
  await page.getByRole('button', { name: 'বাং' }).click();
  await expect(timeline).toContainText('ট্রাকের সময়রেখা');
  await expect(page.getByTestId('bay-seg-work')).toHaveText(/^এ পর্যন্ত ([০-৯]+ ঘ )?[০-৯]+ মি$/);
  await expect(page.getByTestId('bay-occupancy')).toHaveText(/^এ পর্যন্ত ([০-৯]+ ঘ )?[০-৯]+ মি$/);
  await expect(page.getByTestId('bay-visit-cartons')).toHaveText(/^[০-৯,]+( \/ [০-৯,]+)?$/);
  await expect(throughput).toContainText('থ্রুপুট');
  await expect(page.getByTestId('bay-workforce')).toContainText('জনবল');
  await expect(page.getByTestId('bay-storekeeper')).toHaveText(/^(হ্যাঁ|না)$/);
  await expect(more).toContainText('আরও বিস্তারিত');
  expect(await sectionOrder(page)).toEqual([...SECTIONS]);
  await settle(page);
  expect(await timelineShortfall(page), 'timeline below the fold at 1366x768 (BN), px').toBe(0);

  // No Latin digits leaked into the Bangla timeline and throughput.
  await expect(timeline).not.toContainText(/\d/);
  await expect(page.getByTestId('bay-visit-cartons')).not.toContainText(/\d/);
});

test('no truck: the timeline shows its empty state, More details still collapsed, EN then BN', async ({
  page,
}) => {
  // At 10x the peak cycles trucks out quickly enough for one bay to stand empty.
  await openLive(page, 10);
  // A truck can dock between reading the tray row and the click: re-select until the inspector shows the empty state.
  await expect(async () => {
    const row = page.locator('[data-testid^="tray-bay-B"]').filter({ hasText: 'No truck' }).first();
    await row.click({ timeout: 5_000 });
    await expect(page.getByTestId('bay-timeline-empty')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 120_000 });
  // Back to 1x so the bay stays empty for the rest of the checks.
  await page.keyboard.press('Control+Shift+D');
  await page.getByRole('region', { name: 'Simulator' }).getByRole('button', { name: '1×' }).click();
  await page.keyboard.press('Control+Shift+D');

  expect(await sectionOrder(page)).toEqual([...SECTIONS]);
  await expect(page.getByTestId('bay-timeline-empty')).toHaveText('No truck at this bay');
  await expect(page.getByTestId('bay-timeline-bar')).toHaveCount(0);
  await expect(page.getByTestId('bay-visit-cartons')).toHaveText('—');
  await expect(page.getByTestId('bay-more-body')).toHaveCount(0);
  await expect(
    page.getByTestId('bay-more').getByRole('button', { name: 'Show more details' }),
  ).toHaveAttribute('aria-expanded', 'false');

  await page.getByRole('button', { name: 'বাং' }).click();
  await expect(page.getByTestId('bay-timeline-empty')).toHaveText('এই বে-তে কোনো ট্রাক নেই');
  await expect(
    page.getByTestId('bay-more').getByRole('button', { name: 'আরও বিস্তারিত দেখান' }),
  ).toHaveAttribute('aria-expanded', 'false');
});
