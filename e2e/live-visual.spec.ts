import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { settle, startPeak } from './mockSim';

// Visual pass of the /live 2D chrome (docs/06 sections 3-5): screenshots in both languages and themes at the two
// reference sizes, plus a side-by-side composite against the reference frame. VIS_UI_SHOTS=before writes only the
// 1920x1080 EN light frame as docs/screens/vis-ui-before.png (the baseline before a visual change).

const SCREENS = path.resolve(import.meta.dirname, '..', 'docs', 'screens');
const REFERENCE = path.resolve(
  import.meta.dirname,
  '..',
  'docs',
  'reference',
  'video',
  'ui-ref-t09.jpg',
);
const BEFORE = process.env.VIS_UI_SHOTS === 'before';
const SIZES = BEFORE
  ? [{ width: 1920, height: 1080 }]
  : [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
    ];

/** Peak day at 1x, a truck that is loading selected (inspector + tracker filled), tray back on the Bays tab. */
async function openLive(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('/live');
  await expect(page.getByTestId('tray-bay-B02')).toBeVisible({ timeout: 60_000 });
  await startPeak(page);
  await page.getByRole('tab', { name: /Trucks/ }).click();
  const loading = page
    .locator('[data-testid^="tray-truck-V-"]')
    .filter({ hasText: /Loading|Unloading/ })
    .first();
  await expect(loading).toBeVisible({ timeout: 30_000 });
  await loading.click();
  await expect(page.getByTestId('inspector-truck')).toBeVisible();
  await page.getByRole('tab', { name: /Bays/ }).click();
}

async function shot(page: Page, name: string) {
  await settle(page, 800);
  await page.screenshot({ path: path.join(SCREENS, name) });
}

/** The 2D chrome stays inside the layout contract with the 3D view (safe area 112 / 384 / 24 / 24 px). */
async function expectLayoutContract(page: Page) {
  // the inspector slides in (200 ms): measure the resting layout
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
  );
  const vw = page.viewportSize()?.width ?? 0;
  const top = await page.getByTestId('top-bar').boundingBox();
  const chips = await page.getByTestId('kpi-chips').boundingBox();
  expect(chips).not.toBeNull();
  // chips row: at most 112 px tall including margins, measured from the top of the scene area
  expect((chips?.y ?? 0) + (chips?.height ?? 0) - (top?.height ?? 0)).toBeLessThanOrEqual(112);
  for (const id of ['inspector', 'tray']) {
    const box = await page.getByTestId(id).boundingBox();
    if (!box) continue;
    expect(box.width, `${id} width`).toBeLessThanOrEqual(360);
    expect(vw - (box.x + box.width), `${id} gap to the edge`).toBeGreaterThanOrEqual(23.5);
  }
  const tracker = await page.getByTestId('visit-tracker').boundingBox();
  expect(tracker?.height ?? 999).toBeLessThanOrEqual(140);
}

// Four screenshots per size on SwiftShader take a few minutes.
test.describe.configure({ timeout: 420_000 });

for (const { width, height } of SIZES) {
  test(`/live visual pass at ${width}x${height}`, async ({ page }) => {
    await openLive(page, width, height);
    if (BEFORE) {
      await shot(page, 'vis-ui-before.png');
      return;
    }
    await expectLayoutContract(page);
    await shot(page, `vis-ui-after-${width}x${height}-en-light.png`);
    if (width === 1920) await composite(page);

    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await shot(page, `vis-ui-after-${width}x${height}-en-dark.png`);

    await page.getByRole('button', { name: 'বাং' }).click();
    await expect(page.getByTestId('inspector-truck')).toBeVisible();
    await shot(page, `vis-ui-after-${width}x${height}-bn-dark.png`);

    await page.getByRole('button', { name: 'হালকা থিমে যান' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await shot(page, `vis-ui-after-${width}x${height}-bn-light.png`);
    await expectLayoutContract(page);
  });
}

/** docs/06 section 5: our 1920x1080 frame next to the reference, both scaled to 720 px high. */
async function composite(page: Page) {
  const ours = fs.readFileSync(path.join(SCREENS, 'vis-ui-after-1920x1080-en-light.png'));
  const ref = fs.readFileSync(REFERENCE);
  const ctx = await page
    .context()
    .browser()
    ?.newContext({ viewport: { width: 2560, height: 760 } });
  if (!ctx) return;
  const p = await ctx.newPage();
  await p.setContent(
    `<body style="margin:0;background:#fff;display:flex;gap:16px;padding:20px 0 0 0;font:600 14px sans-serif">
      <figure style="margin:0"><img style="height:720px;display:block" src="data:image/png;base64,${ours.toString('base64')}"></figure>
      <figure style="margin:0"><img style="height:720px;display:block" src="data:image/jpeg;base64,${ref.toString('base64')}"></figure>
    </body>`,
  );
  await p.screenshot({ path: path.join(SCREENS, 'vis-ui-compare.png'), fullPage: true });
  await ctx.close();
}
