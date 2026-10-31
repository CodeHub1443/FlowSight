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

/** Click the middle of a bay's staging plate as the default hero view shows it (no camera move). */
async function clickBayInOverview(page: Page, bayId: string) {
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
  const s = bayToSite(bay.face, bay.door, { x: 0, y: 12.5, z: 0 }, layout.floorLevel);
  const v = new Vector3(s.X, s.Y, s.Z).project(camera);
  await page.mouse.click(box.x + ((v.x + 1) / 2) * box.width, box.y + ((1 - v.y) / 2) * box.height);
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
