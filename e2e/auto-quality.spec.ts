import { expect, test } from './fixtures';

// The automatic quality tier on /live (docs/02 section 6 rule 4). This run has no GPU, so the page is told it has one
// (the renderer string a real laptop reports, which starts it at Med) and `__qualityFpsOverride` sets the measured fps.
// Warm-up, hold times and steps run in real time through the real governor. Fast and slow frames on a real GPU were
// measured by hand (docs/PROGRESS.md, Task 12).

declare global {
  interface Window {
    __qualityFpsOverride?: number | null;
    __qualityProbe?: { steps: { to: string; reason: string }[] };
  }
}

const RTX =
  'ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 6GB Laptop GPU (0x000025AC) Direct3D11 vs_5_0 ps_5_0, D3D11)';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((renderer) => {
    const UNMASKED_RENDERER_WEBGL = 0x9246;
    for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      const real = proto.getParameter;
      proto.getParameter = function (p: number) {
        return p === UNMASKED_RENDERER_WEBGL ? renderer : real.call(this, p);
      };
    }
  }, RTX);
  await page.setViewportSize({ width: 800, height: 450 });
});

const setFps = (page: import('@playwright/test').Page, fps: number | null) =>
  page.evaluate((v) => {
    window.__qualityFpsOverride = v;
  }, fps);

const badge = (page: import('@playwright/test').Page) => page.getByTestId('quality-badge');

test('a slow burst during warm-up does not drop the tier; sustained slow frames do; it recovers', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    window.__qualityFpsOverride = 5;
  });
  await page.goto('/live?quality=auto');
  await expect(badge(page)).toHaveAttribute('data-tier', 'med', { timeout: 60_000 });
  await expect(badge(page)).toHaveAttribute('data-state', 'warmup', { timeout: 60_000 });

  // the burst ends as the warm-up does: nothing was measured, nothing stepped
  await setFps(page, 45);
  await expect(badge(page)).toHaveAttribute('data-state', 'monitoring', { timeout: 90_000 });
  await page.waitForTimeout(2500);
  await expect(badge(page)).toHaveAttribute('data-tier', 'med');
  expect(await page.evaluate(() => window.__qualityProbe?.steps.length)).toBe(0);

  // sustained slow frames: Low, with the reason on record
  await setFps(page, 10);
  await expect(badge(page)).toHaveAttribute('data-tier', 'low', { timeout: 60_000 });
  await expect(page.locator('html')).toHaveAttribute('data-quality', 'low');
  expect(await page.evaluate(() => window.__qualityProbe?.steps.at(-1)?.reason)).toBe(
    'sustained-low-fps',
  );

  // the load goes away: back to Med
  await setFps(page, 60);
  await expect(badge(page)).toHaveAttribute('data-tier', 'med', { timeout: 60_000 });
  await expect(page.locator('html')).not.toHaveAttribute('data-quality', 'low');
});

test('a fast GPU climbs to High and stays there', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    window.__qualityFpsOverride = 120;
  });
  await page.goto('/live?quality=auto');
  await expect(badge(page)).toHaveAttribute('data-tier', 'high', { timeout: 90_000 });
  await page.waitForTimeout(30_000);
  await expect(badge(page)).toHaveAttribute('data-tier', 'high');
  expect(await page.evaluate(() => window.__qualityProbe?.steps.map((s) => s.to))).toEqual([
    'high',
  ]);
});

test('a software rasteriser still starts at Low', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  await page.goto('/live?quality=auto');
  await expect(page.getByTestId('quality-badge')).toHaveAttribute('data-tier', 'low', {
    timeout: 60_000,
  });
  await page.close();
});

test('?quality= pins the tier and the governor stays out', async ({ page }) => {
  await page.goto('/live?quality=med');
  await expect(badge(page)).toHaveAttribute('data-state', 'pinned', { timeout: 60_000 });
  await setFps(page, 5);
  await page.waitForTimeout(3000);
  await expect(badge(page)).toHaveAttribute('data-tier', 'med');
});
