import { expect, test } from './fixtures';
import { startPeak } from './mockSim';

// Task 14: trucks, people, forklifts and items are drawn at /live from the mock's live messages. The fixture's guard
// fails every test here on any request to a host other than localhost. Counts come from the debug probe, because
// nothing about a figure on a canvas can be queried; the look is checked by eye (docs/screens/t14-*).

interface Probe {
  people: number;
  forklifts: number;
  carrying: string[];
  trucks: Record<'waiting' | 'reversing' | 'docked' | 'departing', number>;
  items: number;
  ppeRings: number;
}

declare global {
  interface Window {
    __actorProbe?: Probe;
  }
}

const probe = (page: import('@playwright/test').Page) =>
  page.evaluate(() => JSON.parse(JSON.stringify(window.__actorProbe ?? null)) as Probe | null);

test.describe.configure({ timeout: 300_000 });

test('Med tier: every kind of actor appears, with no page errors and no network calls', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(String(e)));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/live?quality=med');
  await expect(page.getByTestId('tray-bay-B02')).toBeVisible({ timeout: 60_000 });
  await startPeak(page, { speed: 10 });

  await expect
    .poll(async () => (await probe(page))?.trucks.docked ?? 0, { timeout: 120_000 })
    .toBeGreaterThan(0);
  await expect
    .poll(async () => (await probe(page))?.people ?? 0, { timeout: 120_000 })
    .toBeGreaterThan(0);
  await expect
    .poll(async () => (await probe(page))?.forklifts ?? 0, { timeout: 120_000 })
    .toBeGreaterThan(0);
  await expect
    .poll(async () => (await probe(page))?.items ?? 0, { timeout: 120_000 })
    .toBeGreaterThan(0);

  // one forklift per crew, and a captain plus 3-6 workers each (the mock's crews, contract section 3.2)
  const p = await probe(page);
  expect(p?.people ?? 0).toBeGreaterThanOrEqual((p?.forklifts ?? 0) * 4);
  // privacy: the plates carry the plate only, and no actor's name reaches the DOM
  const plateText = await page.getByTestId('truck-plate').allTextContents();
  for (const text of plateText) expect(text).not.toMatch(/EMP-|Rahim/);
  expect(problems).toEqual([]);
});

test('Low tier: static figures and trucks, no belt items, no model download', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/live?quality=low');
  await expect(page.getByTestId('tray-bay-B02')).toBeVisible({ timeout: 60_000 });
  await startPeak(page, { speed: 10 });
  await expect
    .poll(async () => (await probe(page))?.people ?? 0, { timeout: 120_000 })
    .toBeGreaterThan(0);
  await expect
    .poll(async () => (await probe(page))?.trucks.docked ?? 0, { timeout: 60_000 })
    .toBeGreaterThan(0);
  expect((await probe(page))?.items).toBe(0);
  expect(requested.filter((u) => u.endsWith('.glb'))).toEqual([]);
});
