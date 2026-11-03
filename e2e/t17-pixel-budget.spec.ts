import fs from 'node:fs';
import path from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import { SiteConfigSchema } from '../src/domain/siteConfig';
import { presetPose } from '../src/scene/camera/presets';
import { applyViewFit, CAMERA_FOV, SCENE_SAFE_AREA, viewFit } from '../src/scene/camera/view';
import { QUALITY, renderPixelRatio, type QualityTier } from '../src/scene/quality';
import { buildSiteLayout } from '../src/scene/site/layout';
import { bayToSite } from '../src/scene/site/transforms';
import { expect, installNetworkGuard, test } from './fixtures';

// The pixel budget (src/scene/quality.ts) in the running app: the drawing buffer at the standard sizes, on every tier,
// with the CSS size and the hit-testing untouched. Sizes come from the DOM, so this holds on SwiftShader too.

const layout = buildSiteLayout(
  SiteConfigSchema.parse(
    JSON.parse(
      fs.readFileSync(
        path.resolve(import.meta.dirname, '..', 'config', 'sites', 'dhk-depot.json'),
        'utf8',
      ),
    ),
  ),
);

test.describe.configure({ timeout: 300_000 });

interface Sizes {
  bufferW: number;
  bufferH: number;
  cssW: number;
  cssH: number;
  slotW: number;
  slotH: number;
  dpr: number;
}

const sizes = (page: Page): Promise<Sizes> =>
  page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="scene-slot"] canvas');
    const slot = document.querySelector('[data-testid="scene-slot"]');
    if (!canvas || !slot) throw new Error('no canvas');
    const c = canvas.getBoundingClientRect();
    const s = slot.getBoundingClientRect();
    return {
      bufferW: canvas.width,
      bufferH: canvas.height,
      cssW: c.width,
      cssH: c.height,
      slotW: s.width,
      slotH: s.height,
      dpr: window.devicePixelRatio,
    };
  });

function expected(tier: QualityTier, s: Sizes, maxPixels = QUALITY[tier].maxPixels) {
  const ratio = renderPixelRatio({
    dpr: QUALITY[tier].dpr,
    deviceDpr: s.dpr,
    cssWidth: s.cssW,
    cssHeight: s.cssH,
    maxPixels,
  });
  return { w: Math.floor(s.cssW * ratio), h: Math.floor(s.cssH * ratio), ratio };
}

async function open(page: Page, tier: string, extra = '') {
  await page.goto(`/live?quality=${tier}${extra}`);
  await expect(page.locator('[data-testid="scene-canvas"][data-scene-ready="true"]')).toHaveCount(
    1,
    { timeout: 120_000 },
  );
}

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 3840, height: 2160 },
  { width: 1366, height: 768 },
];

for (const { width, height } of VIEWPORTS) {
  test(`drawing buffer at ${width}x${height} on every tier`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    for (const tier of ['low', 'med', 'high'] as const) {
      await open(page, tier);
      const s = await sizes(page);
      // CSS size unchanged: the canvas fills its slot whatever it renders at
      expect([s.cssW, s.cssH]).toEqual([s.slotW, s.slotH]);
      expect(s.cssW).toBe(width);
      const want = expected(tier, s);
      expect([s.bufferW, s.bufferH]).toEqual([want.w, want.h]);
      expect(s.bufferW * s.bufferH).toBeLessThanOrEqual(QUALITY[tier].maxPixels);
      // the sizes that must stay as they were: one drawing-buffer pixel per CSS pixel
      const native =
        width <= 1920 || (width === 2560 && tier === 'high')
          ? [Math.floor(s.cssW), Math.floor(s.cssH)]
          : null;
      if (native) expect([s.bufferW, s.bufferH]).toEqual(native);
      else expect(s.bufferW).toBeLessThan(width);
    }
  });
}

test('literal figures: Med and High at 3840x2160 and Med at 2560x1440', async ({ page }) => {
  await page.setViewportSize({ width: 3840, height: 2160 });
  await open(page, 'med');
  const med = await sizes(page);
  expect(med.bufferW * med.bufferH).toBeGreaterThan(2_080_000);
  expect(med.bufferW * med.bufferH).toBeLessThanOrEqual(2_100_000);
  await open(page, 'high');
  const high = await sizes(page);
  expect(high.bufferW * high.bufferH).toBeGreaterThan(3_660_000);
  expect(high.bufferW * high.bufferH).toBeLessThanOrEqual(3_700_000);
});

test('a resize recomputes the ratio; the badge reports it', async ({ page }) => {
  await page.setViewportSize({ width: 3840, height: 2160 });
  await open(page, 'med');
  const badge = page.getByTestId('quality-badge');
  const big = await sizes(page);
  await expect(badge).toHaveAttribute('data-width', String(big.bufferW));
  await expect(badge).toHaveAttribute('data-height', String(big.bufferH));
  expect(Number(await badge.getAttribute('data-ratio'))).toBeCloseTo(expected('med', big).ratio, 3);

  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect.poll(async () => (await sizes(page)).cssW, { timeout: 30_000 }).toBe(1920);
  await expect.poll(async () => (await sizes(page)).bufferW, { timeout: 30_000 }).toBe(1920);
  await expect(badge).toHaveAttribute('data-ratio', '1');

  await page.setViewportSize({ width: 3840, height: 2160 });
  await expect.poll(async () => (await sizes(page)).bufferW, { timeout: 30_000 }).toBe(big.bufferW);
});

test('?pixels= overrides the budget, and rubbish leaves it alone', async ({ page }) => {
  await page.setViewportSize({ width: 3840, height: 2160 });
  await open(page, 'low', '&pixels=1');
  const one = await sizes(page);
  expect(one.bufferW * one.bufferH).toBeLessThanOrEqual(1_000_000);
  expect(one.bufferW * one.bufferH).toBeGreaterThan(990_000);
  await open(page, 'low', '&pixels=100');
  const all = await sizes(page);
  expect([all.bufferW, all.bufferH]).toEqual([Math.floor(all.cssW), Math.floor(all.cssH)]);
  await open(page, 'low', '&pixels=lots');
  const want = expected('low', await sizes(page));
  expect((await sizes(page)).bufferW).toBe(want.w);
});

test('a tier step moves the buffer at a size over the budget', async ({ page }) => {
  await page.addInitScript((renderer) => {
    const UNMASKED_RENDERER_WEBGL = 0x9246;
    const real = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function (p: number) {
      return p === UNMASKED_RENDERER_WEBGL ? renderer : real.call(this, p);
    };
    (window as unknown as { __qualityFpsOverride: number }).__qualityFpsOverride = 120;
  }, 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 Direct3D11, D3D11)');
  await page.setViewportSize({ width: 3840, height: 2160 });
  await open(page, 'auto');
  const badge = page.getByTestId('quality-badge');
  await expect(badge).toHaveAttribute('data-tier', 'med', { timeout: 60_000 });
  const med = await sizes(page);
  expect(med.bufferW).toBe(expected('med', med).w);
  await expect(badge).toHaveAttribute('data-tier', 'high', { timeout: 240_000 });
  await expect
    .poll(async () => (await sizes(page)).bufferW, { timeout: 60_000 })
    .toBe(expected('high', med).w);
});

test('the post chain renders at the same size as the canvas', async ({ page }) => {
  // Med has no shadow map and 1024 contact shadows, so anything bigger than those is the canvas or the post chain.
  // three.js issues one viewport at the CSS size when the renderer is created, before any target exists: frames only.
  await page.addInitScript(() => {
    const probe = { viewport: { w: 0, h: 0 }, allocated: { w: 0, h: 0 } };
    (window as unknown as { __glProbe: typeof probe }).__glProbe = probe;
    const proto = WebGL2RenderingContext.prototype;
    const { viewport, renderbufferStorage, texStorage2D } = proto;
    const grow = (to: { w: number; h: number }, w: number, h: number) => {
      to.w = Math.max(to.w, w);
      to.h = Math.max(to.h, h);
    };
    proto.viewport = function (x, y, w, h) {
      grow(probe.viewport, w, h);
      viewport.call(this, x, y, w, h);
    };
    proto.renderbufferStorage = function (t, f, w, h) {
      grow(probe.allocated, w, h);
      renderbufferStorage.call(this, t, f, w, h);
    };
    proto.texStorage2D = function (t, l, f, w, h) {
      grow(probe.allocated, w, h);
      texStorage2D.call(this, t, l, f, w, h);
    };
  });
  await page.setViewportSize({ width: 3840, height: 2160 });
  await open(page, 'med');
  const frames = (n: number) =>
    page.evaluate(
      (count) =>
        new Promise<void>((done) => {
          let left = count;
          const tick = () => (--left > 0 ? requestAnimationFrame(tick) : done());
          requestAnimationFrame(tick);
        }),
      n,
    );
  const read = () =>
    page.evaluate(() => {
      const { __glProbe: probe } = window as unknown as {
        __glProbe: { viewport: { w: number; h: number }; allocated: { w: number; h: number } };
      };
      const out = JSON.parse(JSON.stringify(probe)) as typeof probe;
      probe.viewport = { w: 0, h: 0 };
      return out;
    });
  await frames(3);
  await read();
  await frames(3);
  const s = await sizes(page);
  const seen = await read();
  expect(s.bufferW).toBeLessThan(2000);
  expect(seen.viewport).toEqual({ w: s.bufferW, h: s.bufferH });
  expect(seen.allocated).toEqual({ w: s.bufferW, h: s.bufferH });
});

test('theme switches leave no GPU texture behind', async ({ page }) => {
  // Task 17 soak: a new environment target per theme leaked one PMREM map per switch (three.js does not free it)
  await page.setViewportSize({ width: 800, height: 450 });
  await open(page, 'med');
  const textures = () =>
    page.evaluate(() => {
      const probe = (
        window as unknown as {
          __qualityProbe: { renderer: { info: { memory: { textures: number } } } | null };
        }
      ).__qualityProbe;
      return probe.renderer?.info.memory.textures ?? null;
    });
  const toggle = page.getByTestId('theme-toggle');
  const frames = () =>
    page.evaluate(
      () =>
        new Promise<void>((done) => {
          let left = 4;
          const tick = () => (--left > 0 ? requestAnimationFrame(tick) : done());
          requestAnimationFrame(tick);
        }),
    );
  // the first round in each theme compiles and uploads what that theme needs
  for (let i = 0; i < 2; i++) {
    await toggle.click();
    await frames();
  }
  const settled = await textures();
  expect(settled).not.toBeNull();
  for (let i = 0; i < 6; i++) {
    await toggle.click();
    await frames();
  }
  expect(await textures()).toBe(settled);
});

/** Page coordinates of the middle of a bay's staging plate in the default view. */
function stagingPoint(box: { x: number; y: number; width: number; height: number }, bayId: string) {
  const bay = layout.bays.find((b) => b.id === bayId);
  if (!bay) throw new Error('no bay');
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
  return { x: box.x + ((v.x + 1) / 2) * box.width, y: box.y + ((1 - v.y) / 2) * box.height };
}

test('hit-testing is unchanged at a lowered ratio', async ({ page }) => {
  await page.setViewportSize({ width: 3840, height: 2160 });
  await open(page, 'low');
  await expect(page.getByTestId('tray-bay-B04')).toBeVisible({ timeout: 90_000 });
  const s = await sizes(page);
  expect(s.bufferW).toBeLessThan(s.cssW);
  const box = await page.getByTestId('scene-slot').locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  // the pose has to have landed before the point computed from it is right
  await page.waitForTimeout(4000);
  const p = stagingPoint(box, 'B04');
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('inspector-bay')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('inspector-title')).toContainText('4');
});

test('keyboard pan still works at a lowered ratio', async ({ page }) => {
  await page.setViewportSize({ width: 3840, height: 2160 });
  await open(page, 'low');
  await page.getByTestId('scene-canvas').focus();
  const pose = () =>
    page.evaluate(() => {
      const cam = (window as unknown as { __sceneCamera?: { pose(): { target: number[] } | null } })
        .__sceneCamera;
      return cam?.pose()?.target ?? null;
    });
  await expect.poll(pose, { timeout: 60_000 }).not.toBeNull();
  await page.waitForTimeout(3000);
  const before = await pose();
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(3000);
  await page.keyboard.up('ArrowLeft');
  await expect.poll(pose, { timeout: 60_000 }).not.toEqual(before);
});

async function withScale(browser: Browser, scale: number, run: (page: Page) => Promise<void>) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: scale,
  });
  const page = await context.newPage();
  const offenders = await installNetworkGuard(page);
  await run(page);
  expect(offenders).toEqual([]);
  await context.close();
}

for (const scale of [1.5, 2]) {
  test(`device scale ${scale} at 1920x1080 stays inside the budget`, async ({ browser }) => {
    await withScale(browser, scale, async (page) => {
      for (const tier of ['low', 'med', 'high'] as const) {
        await open(page, tier);
        const s = await sizes(page);
        expect(s.dpr).toBe(scale);
        const want = expected(tier, s);
        expect([s.bufferW, s.bufferH]).toEqual([want.w, want.h]);
        expect(s.bufferW * s.bufferH).toBeLessThanOrEqual(QUALITY[tier].maxPixels);
      }
    });
  });
}
