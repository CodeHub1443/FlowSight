import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { startPeak } from './mockSim';

// docs/06 §4 with real layout: at 60x mock speed the /live chrome must not change size or remount rows.
// Samples the boxes of the chips, tray rows, cards and tracker steps every 100 ms for 5 s, and records any tray row,
// chip or tracker step that leaves the DOM. The tray stays on the Bays tab (seven rows, fixed membership).

const LAYOUT =
  '[data-testid^="kpi-"]:not([data-testid="kpi-delta"]), [data-testid^="tray-bay-B"]:not([data-testid^="tray-bay-alerts"]), [data-testid="tray"], [data-testid="inspector"], [data-testid="visit-tracker"], [data-testid^="tracker-step-"]';
const ROWS = 'li[data-flip-key], [data-testid^="kpi-"], [data-testid^="tracker-step-"]';

async function sample(page: Page, ms: number) {
  return page.evaluate(
    async ({ ms, layout, rows }) => {
      const first = new Map<string, string>();
      const changes = new Set<string>();
      const removed: string[] = [];
      const observer = new MutationObserver((records) => {
        for (const r of records)
          for (const n of Array.from(r.removedNodes))
            if (n instanceof Element && (n.matches(rows) || n.querySelector(rows)))
              removed.push(n.outerHTML.slice(0, 100));
      });
      const root = document.querySelector('[data-testid="live-page"]');
      if (root) observer.observe(root, { childList: true, subtree: true });
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        for (const el of Array.from(document.querySelectorAll(layout))) {
          const r = el.getBoundingClientRect();
          const key = el.getAttribute('data-testid') ?? '';
          const box = `${r.width.toFixed(1)}x${r.height.toFixed(1)}`;
          const was = first.get(key);
          if (was === undefined) first.set(key, box);
          else if (was !== box) changes.add(`${key}: ${was} -> ${box}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      observer.disconnect();
      return { tracked: first.size, changes: [...changes], removed };
    },
    { ms, layout: LAYOUT, rows: ROWS },
  );
}

test('/live chrome keeps its size and rows at 60x mock speed, EN and BN', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/live');
  await expect(page.getByTestId('tray-bay-B02')).toBeVisible({ timeout: 60_000 });
  await startPeak(page, { speed: 60 });
  await page.getByTestId('tray-bay-B02').click();
  await expect(page.getByTestId('inspector-bay')).toBeVisible();
  await page.waitForTimeout(1500);

  for (const lang of ['en', 'bn'] as const) {
    if (lang === 'bn') {
      await page.getByRole('button', { name: 'বাং' }).click();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1000);
    }
    const { tracked, changes, removed } = await sample(page, 5000);
    expect(tracked, lang).toBeGreaterThanOrEqual(20);
    expect(changes, `${lang}: boxes that changed size`).toEqual([]);
    expect(removed, `${lang}: rows, chips or steps that unmounted`).toEqual([]);
  }
});
