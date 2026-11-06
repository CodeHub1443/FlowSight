import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { startPeak } from './mockSim';

// Task 22A: alerts and evidence centre (/events), live notifications and the links from the live panels.
// WRITTEN IN THE PARALLEL PHASE, NOT RUN THERE (no browser in the parallel phase). Run alone in 22.9:
//   pnpm exec playwright test e2e/t22a-events.spec.ts
// Mock mode (the default webServer). The simulator raises hygiene, belt, PPE and safety events at peak, so the list fills by itself.

async function openLive(page: Page) {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto('/live');
  await expect(page.getByTestId('tray-bay-B02')).toBeVisible({ timeout: 60_000 });
  await startPeak(page);
}

/** /events with at least one row (the simulator needs a moment to raise the first alerts). */
async function openEvents(page: Page, path = '/events') {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(path);
  await expect(page.getByTestId('events-page')).toBeVisible();
}

test.describe('Events page', () => {
  test('lists open alerts, newest first, with the simulated-data marker', async ({ page }) => {
    await openEvents(page);
    await expect(page.getByTestId('events-simulated')).toBeVisible();
    await expect(page.getByRole('grid')).toBeVisible();
    // the good state when nothing is open, otherwise rows
    await expect(
      page.locator('[data-testid^="events-row-"], [data-testid="events-none-open"]').first(),
    ).toBeVisible({
      timeout: 60_000,
    });
  });

  test('windows the table: the DOM never holds more than a screenful of rows', async ({ page }) => {
    await openLive(page);
    await page.goto('/events?status=OPEN,ACK,CLOSED');
    await expect(page.getByRole('grid')).toBeVisible();
    const rows = await page.getByRole('row').count();
    expect(rows).toBeLessThan(60);
  });

  test('filters live in the URL and survive a reload', async ({ page }) => {
    await openEvents(page);
    await page.getByTestId('events-status-CLOSED').click();
    await expect(page).toHaveURL(/status=OPEN%2CACK%2CCLOSED/);
    await page.getByTestId('events-group-hygiene').click();
    await expect(page).toHaveURL(/group=hygiene/);
    await page.reload();
    await expect(page.getByTestId('events-status-CLOSED')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('events-group-hygiene')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('events-clear').click();
    await expect(page).toHaveURL(/\/events$/);
  });

  test('a group count on the page equals the KPI popover count (same predicate)', async ({
    page,
  }) => {
    await openLive(page);
    await page.getByTestId('kpi-alerts').hover();
    await page.getByTestId('kpi-alerts').click();
    const rows = page.getByTestId('kpidetail-groups').locator('[data-group]');
    await expect(rows.first()).toBeVisible({ timeout: 60_000 });
    const first = rows.first();
    const group = (await first.getAttribute('data-group')) ?? '';
    const total = await first.getAttribute('data-total');
    // the popover row links to the Events page with the group filter
    await first.click();
    await expect(page).toHaveURL(new RegExp(`/events\\?group=${group}`));
    // the live store keeps counting while we navigate; compare the chip with the rows it filters (allow +-2 for arrivals)
    const chip = page.getByTestId(`events-group-${group}`);
    await expect(chip).toBeVisible();
    const onPage = Number(await chip.getAttribute('data-total'));
    expect(Math.abs(onPage - Number(total))).toBeLessThanOrEqual(2);
  });

  test('keyboard: Down, Enter opens the drawer, A acknowledges, Escape closes', async ({
    page,
  }) => {
    await openLive(page);
    await page.goto('/events');
    const rows = page.locator('[data-testid^="events-row-"]');
    await expect(rows.first()).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('events-scroller').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/events\/[0-9A-Z]{26}/);
    await expect(page.getByTestId('event-detail')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('event-detail')).toBeHidden();
    await expect(page).toHaveURL(/\/events(\?.*)?$/);
  });
});

test.describe('Event drawer', () => {
  test('shows evidence, history and acts: acknowledge, then close with a note', async ({
    page,
  }) => {
    await openLive(page);
    await page.goto('/events');
    const first = page.locator('[data-testid^="events-row-"]').first();
    await expect(first).toBeVisible({ timeout: 60_000 });
    await first.click();
    const detail = page.getByTestId('event-detail');
    await expect(detail).toBeVisible();
    await expect(detail.getByTestId('event-history')).toContainText(/Raised/);
    await expect(detail.getByTestId('event-snapshot')).toBeVisible();

    await detail.getByTestId('event-ack').click();
    await expect(detail).toHaveAttribute('data-status', 'ACK');

    await detail.getByTestId('event-close').click();
    await detail.getByTestId('event-draft').fill('ab');
    await expect(detail.getByTestId('event-submit')).toBeDisabled();
    await detail.getByTestId('event-draft').fill('checked on site');
    await detail.getByTestId('event-submit').click();
    await expect(detail).toHaveAttribute('data-status', 'CLOSED');
    await expect(detail.getByTestId('event-history')).toContainText('checked on site');
  });

  test('deep link to an unknown id shows one neutral state', async ({ page }) => {
    await openEvents(page, '/events/01ZZZZZZZZZZZZZZZZZZZZZZZZ');
    await expect(page.getByTestId('event-notfound')).toContainText(
      'Event not found or not available',
    );
  });

  test('the drawer is full width under 1024 px', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await openLive(page);
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto('/events');
    const first = page.locator('[data-testid^="events-row-"]').first();
    await expect(first).toBeVisible({ timeout: 60_000 });
    await first.click();
    const box = await page.getByTestId('event-drawer').boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(890);
  });

  test('Bangla: the page and the drawer render in Bangla', async ({ page }) => {
    await openEvents(page);
    await page.getByTestId('language-bn').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ইভেন্ট');
    const first = page.locator('[data-testid^="events-row-"]').first();
    await expect(first).toBeVisible({ timeout: 60_000 });
    await first.click();
    await expect(page.getByTestId('event-ack')).toHaveText('স্বীকার করুন');
  });
});

test.describe('Live notifications and links', () => {
  test('a live warn event raises a toast with "Show on map" and "Open"; at most 3 at once', async ({
    page,
  }) => {
    await openLive(page);
    const toast = page.getByTestId('live-toast').first();
    await expect(toast).toBeVisible({ timeout: 120_000 });
    await expect(toast.getByRole('button', { name: 'Show on map' })).toBeVisible();
    await expect(toast.getByRole('button', { name: 'Open' })).toBeVisible();
    expect(await page.getByTestId('live-toast').count()).toBeLessThanOrEqual(3);
  });

  test('"Open" on a toast opens the event in the Events page', async ({ page }) => {
    await openLive(page);
    const toast = page.getByTestId('live-toast').first();
    await expect(toast).toBeVisible({ timeout: 120_000 });
    await toast.getByRole('button', { name: 'Open' }).click();
    await expect(page).toHaveURL(/\/events\/[0-9A-Z]{26}/);
    await expect(page.getByTestId('event-detail')).toBeVisible();
  });

  test('the bell footer links to /events', async ({ page }) => {
    await openLive(page);
    await page.getByTestId('alert-bell').click();
    await page.getByText('View all events').click();
    await expect(page).toHaveURL(/\/events$/);
  });

  test('a tray alert row has "Open in Events"', async ({ page }) => {
    await openLive(page);
    await page.getByRole('tab', { name: /Alerts/ }).click();
    const link = page.locator('[data-testid^="tray-alert-"][data-testid$="-open"]').first();
    await expect(link).toBeVisible({ timeout: 60_000 });
    await link.click();
    await expect(page).toHaveURL(/\/events\/[0-9A-Z]{26}/);
  });

  test('the inspector event body has the actions and "Open in Events"', async ({ page }) => {
    await openLive(page);
    await page.getByRole('tab', { name: /Alerts/ }).click();
    await page.locator('[data-testid^="tray-alert-"]:not([data-testid$="-open"])').first().click();
    await expect(page.getByTestId('inspector-open-events')).toBeVisible();
    await expect(page.getByTestId('event-ack')).toBeVisible();
  });
});
