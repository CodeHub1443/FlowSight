import { expect, test } from './fixtures';
import { startPeak } from './mockSim';

// Task 15: people are drawn outside what stands on the floor, wherever the data puts them. Nothing on a canvas can be
// queried, so the debug probe compares the data's position and the drawn one against the same footprints, in the running
// app; the look is checked by eye (docs/screens/t15-collision-*).

interface Probe {
  people: number;
  personSamples: number;
  dataInProps: number;
  drawnInProps: number;
}

const probe = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const p = (window as unknown as { __actorProbe?: Probe }).__actorProbe;
    return p ? { ...p } : null;
  });

test('at peak the data puts people inside props; the drawn figures stay out', async ({ page }) => {
  test.setTimeout(300_000);
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(String(e)));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/live?quality=low');
  await expect(page.getByTestId('tray-bay-B02')).toBeVisible({ timeout: 60_000 });
  await startPeak(page, { speed: 10 });
  await expect
    .poll(async () => (await probe(page))?.dataInProps ?? 0, { timeout: 180_000 })
    .toBeGreaterThan(20);
  const p = await probe(page);
  // Low places each figure at once, with no blend: not one sample may be drawn inside
  expect(p?.drawnInProps).toBe(0);
  expect(p?.personSamples ?? 0).toBeGreaterThan(0);
  expect(problems).toEqual([]);
});
