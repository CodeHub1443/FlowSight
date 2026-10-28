import path from 'node:path';
import type { Page } from '@playwright/test';
import { SCENE_SAFE_AREA, viewFit } from '../src/scene/camera/view';
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

  // Default floor overview is centred on the middle bay: a click there selects B04.
  await clickSceneCentre(page);
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

for (const { width, height } of SIZES) {
  test(`/live with the 3D interior at ${width}x${height}, EN and BN`, async ({ page }) => {
    await openLive(page, width, height);
    // Select the middle bay from the 3D view (no camera move), so the inspector and ring show over all 7 belts.
    await clickSceneCentre(page);
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
