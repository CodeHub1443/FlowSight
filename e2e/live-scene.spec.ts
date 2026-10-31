import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import { SiteConfigSchema } from '../src/domain/siteConfig';
import { presetPose } from '../src/scene/camera/presets';
import { buildSiteLayout } from '../src/scene/site/layout';
import { bayToSite } from '../src/scene/site/transforms';
import { applyViewFit, CAMERA_FOV, SCENE_SAFE_AREA, viewFit } from '../src/scene/camera/view';
import { expect, test } from './fixtures';

// /live with the lazy 3D shed interior mounted behind the shell (step-05 + step-06 integration).
// Headless WebGL runs on SwiftShader (see playwright.config.ts), so frames are slow: waits are generous.

const SCREENS = path.resolve(import.meta.dirname, '..', 'docs', 'screens');
const SIZES = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
];
/** Camera fly is 800 ms; SwiftShader renders a few frames per second. */
const FLY_SETTLE_MS = 3000;

// No page.clock here: Playwright's clock also drives requestAnimationFrame, and with the continuous WebGL loop a
// screenshot then took 45-54 s instead of 10-16 s (1366, SwiftShader, Task 08). Measured on a quiet machine without
// it: scene ready ~3 s after load, frames 0.35-0.55 s, a screenshot 10-16 s at 1366 and 16-22 s at 1920; a test
// with two screenshots needs ~60-70 s at 1920, so the scene specs get 150 s instead of the 90 s default.
test.describe.configure({ timeout: 150_000 });

async function openLive(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('/live');
  // mock mode: the app renders after MSW starts, and bays arrive once the simulator's history is generated
  await expect(page.getByTestId('tray-bay-B02')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-testid="scene-canvas"][data-scene-ready="true"]')).toHaveCount(
    1,
    { timeout: 60_000 },
  );
  await expect(page.getByTestId('scene-slot').locator('canvas')).toHaveCount(1);
  // first frames, baked contact shadows and fonts
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(FLY_SETTLE_MS);
}

/** Click the centre of the safe area: the camera target projects there (setViewOffset), the overlays leave it free. */
const SITE_CONFIG = path.resolve(import.meta.dirname, '..', 'config', 'sites', 'dhk-depot.json');
const layout = buildSiteLayout(
  SiteConfigSchema.parse(JSON.parse(fs.readFileSync(SITE_CONFIG, 'utf8'))),
);

/** Page coordinates of a bay-frame point as the default hero view shows it (no camera move). */
async function bayPointInOverview(
  page: Page,
  bayId: string,
  at: { x: number; y: number; z: number },
) {
  const box = await page.getByTestId('scene-slot').locator('canvas').boundingBox();
  const bay = layout.bays.find((b) => b.id === bayId);
  if (!box || !bay) throw new Error('no canvas or bay');
  const fit = viewFit(box.width, box.height, SCENE_SAFE_AREA);
  const camera = new PerspectiveCamera(CAMERA_FOV, box.width / box.height, 1, 700);
  applyViewFit(camera, fit);
  const pose = presetPose(layout, 'floorOverview', fit);
  if (!pose) throw new Error('no pose');
  camera.position.set(...pose.position);
  camera.lookAt(new Vector3(...pose.target));
  camera.updateMatrixWorld();
  const s = bayToSite(bay.face, bay.door, at, layout.floorLevel);
  const v = new Vector3(s.X, s.Y, s.Z).project(camera);
  return {
    x: box.x + ((v.x + 1) / 2) * box.width,
    y: box.y + ((1 - v.y) / 2) * box.height,
  };
}

/** Click the middle of a bay's staging plate as the default hero view shows it. */
async function clickBayInOverview(page: Page, bayId: string) {
  const p = await bayPointInOverview(page, bayId, { x: 0, y: 12.5, z: 0 });
  await page.mouse.click(p.x, p.y);
}

/**
 * Yellow (painted line) and saturated blue (selection) pixels in small windows around the given page points, all read
 * from one screenshot: on SwiftShader each capture takes 10-20 s.
 */
async function paintAround(
  page: Page,
  windows: readonly { x: number; y: number; radius?: number }[],
): Promise<{ yellow: number; blue: number }[]> {
  const png = await page.screenshot();
  return page.evaluate(
    async ({ b64, windows }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d');
      if (!g) throw new Error('no 2d context');
      g.drawImage(img, 0, 0);
      return windows.map(({ x, y, radius = 3 }) => {
        const size = 2 * radius + 1;
        const d = g.getImageData(Math.round(x) - radius, Math.round(y) - radius, size, size).data;
        let yellow = 0;
        let blue = 0;
        for (let i = 0; i < d.length; i += 4) {
          const [r = 0, gn = 0, b = 0] = [d[i], d[i + 1], d[i + 2]];
          if (r > 200 && gn > 160 && b < 140) yellow++;
          if (b > 190 && b - r > 90) blue++;
        }
        return { yellow, blue };
      });
    },
    { b64: png.toString('base64'), windows },
  );
}

const sum = (list: readonly { yellow: number; blue: number }[], key: 'yellow' | 'blue') =>
  list.reduce((n, w) => n + w[key], 0);

/** Points on the two long side edges of a bay's plate (x = +-3), away from the shared aisle line. */
async function plateEdgePoints(page: Page, bayId: string) {
  const out = [];
  for (const x of [-2.92, 2.92]) {
    // staging is seeded per bay: at these depths no stack (a yellow pallet in B04) stands in front of the edge
    for (const y of [9.5, 11.5, 14.5, 15]) {
      out.push(await bayPointInOverview(page, bayId, { x, y, z: 0 }));
    }
  }
  return out;
}

async function clickSceneCentre(page: Page) {
  const box = await page.getByTestId('scene-slot').locator('canvas').boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  const { centre } = viewFit(box.width, box.height, SCENE_SAFE_AREA);
  await page.mouse.click(box.x + centre.x, box.y + centre.y);
}

test('tray row flies the camera to the bay; clicking a bay in 3D opens the bay inspector', async ({
  page,
}) => {
  await openLive(page, 1920, 1080);
  const title = page.getByTestId('inspector-title');

  // In the default hero view a click on the middle bay's floor selects B04.
  await clickBayInOverview(page, 'B04');
  await expect(page.getByTestId('inspector-bay')).toBeVisible();
  await expect(title).toHaveText('Bay 4');

  // Tray row: selects B06 and flies the camera to it.
  await page.getByTestId('tray-bay-B06').click();
  await expect(title).toHaveText('Bay 6');
  await page.waitForTimeout(FLY_SETTLE_MS);

  // Clear the selection, then click the same screen point: it now lands on B06, so the camera moved there.
  await page.getByTestId('inspector-close').click();
  await expect(page.getByTestId('inspector')).toHaveCount(0);
  await clickSceneCentre(page);
  await expect(page.getByTestId('inspector-bay')).toBeVisible();
  await expect(title).toHaveText('Bay 6');
});

test('a selected bay stays blue with the pointer away, and yellow never marks it', async ({
  page,
}) => {
  await openLive(page, 1366, 768);
  const selected = await plateEdgePoints(page, 'B04');
  const other = await plateEdgePoints(page, 'B02');
  const corner = await bayPointInOverview(page, 'B04', { x: 3.15, y: 16, z: 3 });
  const count = selected.length;

  // the check can see the paint: before selection B04's plate edge is the yellow guide line
  const before = await paintAround(page, selected);
  expect(sum(before, 'yellow'), 'B04 before selection').toBeGreaterThan(0);

  await clickBayInOverview(page, 'B04');
  await expect(page.getByTestId('inspector-bay')).toBeVisible();
  await page.waitForTimeout(1000);
  expect(sum(await paintAround(page, selected), 'blue'), 'selected, hovered').toBeGreaterThan(20);

  // over the top bar: off the canvas, so the bay gets a pointer-leave
  await page.mouse.move(683, 10);
  await page.waitForTimeout(1000);
  const away = await paintAround(page, [...selected, ...other, { ...corner, radius: 7 }]);
  const onSelected = away.slice(0, count);
  expect(sum(onSelected, 'blue'), 'pointer away: the blue outline').toBeGreaterThan(20);
  expect(sum(onSelected, 'yellow'), 'pointer away: no yellow outline').toBe(0);
  // the painted guide line stays on every other bay
  expect(sum(away.slice(count, 2 * count), 'yellow'), 'B02 keeps its line').toBeGreaterThan(0);
  expect(away.at(-1)?.blue ?? 0, 'pointer away: a bracket tick').toBeGreaterThan(0);
  await expect(page.getByTestId('scene-selection-pill').locator('div').first()).toHaveCSS(
    'opacity',
    '1',
  );

  // a theme switch rebuilds the marker's materials: it must come back for the bay still selected
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.waitForTimeout(FLY_SETTLE_MS);
  expect(sum(await paintAround(page, selected), 'blue'), 'selected, dark theme').toBeGreaterThan(
    20,
  );
});

test('map controls move the camera, and home returns to the hero view', async ({ page }) => {
  await openLive(page, 1920, 1080);
  const pill = page.getByTestId('scene-bay-pill').first();
  const place = () => pill.evaluate((el) => (el as HTMLElement).dataset.t ?? '');
  await page.waitForTimeout(FLY_SETTLE_MS);
  const hero = await place();
  await page.getByTestId('map-zoom-in').click();
  await page.waitForTimeout(FLY_SETTLE_MS);
  const zoomed = await place();
  expect(zoomed).not.toBe(hero);
  await page.getByTestId('map-rotate-left').click();
  await page.waitForTimeout(FLY_SETTLE_MS);
  expect(await place()).not.toBe(zoomed);
  await page.getByTestId('map-home').click();
  await page.waitForTimeout(FLY_SETTLE_MS);
  expect(await place()).toBe(hero);
});

for (const { width, height } of SIZES) {
  test(`/live with the 3D interior at ${width}x${height}, EN and BN`, async ({ page }) => {
    await openLive(page, width, height);
    // Select the middle bay from the 3D view (no camera move), so the inspector and brackets show over all 7 belts.
    await clickBayInOverview(page, 'B04');
    await expect(page.getByTestId('inspector-bay')).toBeVisible();
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(SCREENS, `step-merge-01-live-${width}x${height}-en.png`),
    });

    await page.getByRole('button', { name: 'বাং' }).click();
    await expect(page.getByTestId('inspector-title')).toHaveText('বে ৪');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(SCREENS, `step-merge-01-live-${width}x${height}-bn.png`),
    });
  });
}

test('/live dark theme re-themes the scene', async ({ page }) => {
  await openLive(page, 1920, 1080);
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.waitForTimeout(FLY_SETTLE_MS);
  await page.screenshot({ path: path.join(SCREENS, 'step-merge-01-live-1920x1080-dark.png') });
});
