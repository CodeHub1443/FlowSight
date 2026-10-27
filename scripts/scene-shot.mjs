/* global window, document, requestAnimationFrame -- used inside page.evaluate callbacks (browser context) */
// Screenshots of the 3D scene into docs/screens/<prefix>-*.png, frame timings per quality tier and a side-by-side
// composite against the reference video. Starts Vite programmatically on port 5176 (strictPort), blocks every
// non-localhost request and closes everything on exit. Headless WebGL runs on SwiftShader (CPU), so frame times
// are NOT representative of a GPU; they only compare tiers and show the geometry budget.
//
//   node scripts/scene-shot.mjs --prefix=vis-3d-before          preview: floor overview, bay 4, dock wall
//   node scripts/scene-shot.mjs --prefix=vis-3d-after --all     + dark, Bangla, click check, /live, perf, compare
//
// Flags: --extras (dark + Bangla preview), --interact (click-select check), --live (/live at 1920 and 1366),
// --perf (draw calls, triangles, frame times for high/med/low), --compare (composite with ui-ref-t09.jpg),
// --all (all of these), --no-views (skip the three preview views). --prefix=NAME sets the file prefix (default vis-3d).
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const PORT = 5176;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = fileURLToPath(new URL('../docs/screens/', import.meta.url));
const REFERENCE = fileURLToPath(new URL('../docs/reference/video/ui-ref-t09.jpg', import.meta.url));
const LOCAL = new Set(['localhost', '127.0.0.1']);
const SIZE = { width: 1920, height: 1080 };
const FLY_SETTLE_MS = 1800;

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag) || args.includes('--all');
const prefix = args.find((a) => a.startsWith('--prefix='))?.slice('--prefix='.length) ?? 'vis-3d';
const shotPath = (name) => `${OUT}${prefix}-${name}.png`;

mkdirSync(OUT, { recursive: true });

const server = await createServer({
  root: ROOT,
  logLevel: 'warn',
  server: { port: PORT, strictPort: true, host: '127.0.0.1' },
});
await server.listen();

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
  ],
});

const offenders = [];
const problems = [];
const report = {};

async function newPage(size = SIZE) {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (['data:', 'blob:', 'about:'].includes(u.protocol) || LOCAL.has(u.hostname))
      return route.continue();
    offenders.push(u.href);
    return route.abort('blockedbyclient');
  });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  return { context, page };
}

async function openPreview(query = '') {
  const { context, page } = await newPage();
  await page.goto(`http://127.0.0.1:${PORT}/scene-preview.html${query}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await page.waitForSelector('canvas', { timeout: 120_000 });
  await page.waitForFunction(() => window.__sceneGl !== undefined, undefined, { timeout: 120_000 });
  await page.waitForTimeout(2500);
  return { context, page };
}

async function openLive(size, query = '') {
  const { context, page } = await newPage(size);
  await page.goto(`http://127.0.0.1:${PORT}/live${query}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await page.waitForSelector('[data-testid="tray-bay-B02"]', { timeout: 120_000 });
  await page.waitForSelector('[data-testid="scene-canvas"][data-scene-ready="true"]', {
    timeout: 120_000,
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(4000);
  return { context, page };
}

/** Per-frame renderer counters (autoReset off so post-processing passes are counted too) and frame times. */
async function frameStats(page, ms = 8000) {
  return page.evaluate(
    (duration) =>
      new Promise((resolve) => {
        const gl = window.__sceneGl;
        gl.info.autoReset = false;
        gl.info.reset();
        const times = [];
        const calls = [];
        const tris = [];
        let last = performance.now();
        const end = last + duration;
        const tick = (now) => {
          times.push(now - last);
          last = now;
          if (gl.info.render.calls > 0) {
            calls.push(gl.info.render.calls);
            tris.push(gl.info.render.triangles);
          }
          gl.info.reset();
          if (now < end) requestAnimationFrame(tick);
          else {
            gl.info.autoReset = true;
            const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0;
            const sorted = times.slice(2).sort((a, b) => a - b);
            const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;
            resolve({
              frames: sorted.length,
              avgMs: +avg.toFixed(1),
              p95Ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1),
              fps: +(1000 / avg).toFixed(1),
              drawCallsPerFrame: median(calls),
              trianglesPerFrame: median(tris),
              geometries: gl.info.memory.geometries,
              textures: gl.info.memory.textures,
              programs: gl.info.programs?.length ?? null,
            });
          }
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

async function flyPreview(page, target) {
  if (/^B\d+$/.test(target)) await page.selectOption('select[aria-label="Bay"]', target);
  else await page.click(`[data-preset="${target}"]`);
  await page.waitForTimeout(FLY_SETTLE_MS);
}

try {
  // 1. Preview views (light, English, high tier)
  if (!args.includes('--no-views') || has('--interact') || has('--perf')) {
    const { context, page } = await openPreview('?quality=high');
    for (const [name, target] of args.includes('--no-views')
      ? []
      : [
          ['floor-overview', 'floorOverview'],
          ['bay-4', 'B04'],
          ['dock-wall', 'dockWall'],
        ]) {
      await flyPreview(page, target);
      await page.screenshot({ path: shotPath(name), timeout: 180_000, animations: 'disabled' });
      console.log(`shot ${prefix}-${name}`);
    }

    if (has('--interact')) {
      // The default view centres the middle bay in the safe area (the region the cards leave free); a click
      // at the safe-area centre must select B04 through onSelect and draw its ring and pill.
      await flyPreview(page, 'floorOverview');
      const safe = await page.evaluate(() => window.__sceneSafeCentre ?? null);
      const at = safe ?? { x: SIZE.width / 2, y: SIZE.height / 2 };
      // SwiftShader under load renders a frame every few seconds: let the fly finish before picking
      await page.waitForTimeout(4000);
      await page.mouse.click(at.x, at.y);
      await page.waitForTimeout(3000);
      const picked = await page.getAttribute('[data-testid="scene-controls"]', 'data-selected');
      console.log(`click at safe centre (${at.x}, ${at.y}) selected: ${picked}`);
      report.clickSelect = picked;
      if (picked !== 'B04') process.exitCode = 1;
      await page.screenshot({
        path: shotPath('selected-bay'),
        timeout: 180_000,
        animations: 'disabled',
      });
    }

    if (has('--perf')) {
      const timings = {};
      for (const tier of ['high', 'med', 'low']) {
        await page.selectOption('select[aria-label="Quality"]', tier);
        await flyPreview(page, 'floorOverview');
        await page.waitForTimeout(1500);
        timings[tier] = await frameStats(page);
      }
      report.perf = timings;
      console.log('frame timing (headless SwiftShader, not representative):');
      console.table(timings);
    }
    await context.close();
  }

  // 2. Dark theme and Bangla UI (preview)
  if (has('--extras')) {
    for (const [name, query] of [
      ['dark', '?quality=high&theme=dark'],
      ['bn', '?quality=high'],
    ]) {
      const v = await openPreview(query);
      if (name === 'bn') {
        await v.page.click('text=বাং');
        await v.page.waitForTimeout(400);
        // select B04 so the Bangla selection pill shows
        const safe = await v.page.evaluate(() => window.__sceneSafeCentre ?? null);
        if (safe) await v.page.mouse.click(safe.x, safe.y);
        await v.page.waitForTimeout(900);
      }
      await v.page.screenshot({ path: shotPath(name), timeout: 180_000, animations: 'disabled' });
      console.log(`shot ${prefix}-${name}`);
      await v.context.close();
    }
  }

  // 3. /live with the real shell (cards) at both desktop sizes: B01 must stay clear of the right column
  if (has('--live')) {
    for (const size of [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
    ]) {
      const { context, page } = await openLive(size, '?quality=high');
      const name = `live-${size.width}x${size.height}-en`;
      await page.screenshot({ path: shotPath(name), timeout: 180_000, animations: 'disabled' });
      console.log(`shot ${prefix}-${name}`);
      if (size.width === 1920) {
        await page.getByRole('button', { name: 'বাং' }).click();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(1200);
        await page.screenshot({
          path: shotPath('live-1920x1080-bn'),
          timeout: 180_000,
          animations: 'disabled',
        });
        console.log(`shot ${prefix}-live-1920x1080-bn`);
        await page.getByRole('button', { name: 'EN' }).click();
        await page.getByRole('button', { name: 'Switch to dark theme' }).click();
        await page.waitForTimeout(2500);
        await page.screenshot({
          path: shotPath('live-1920x1080-dark'),
          timeout: 180_000,
          animations: 'disabled',
        });
        console.log(`shot ${prefix}-live-1920x1080-dark`);
      }
      await context.close();
    }
  }

  // 4. Side-by-side composite: our /live (or the preview overview) next to the reference frame
  if (has('--compare')) {
    let oursFile = shotPath('live-1920x1080-en');
    try {
      readFileSync(oursFile);
    } catch {
      oursFile = shotPath('floor-overview');
    }
    const toData = (file, mime) => `data:${mime};base64,${readFileSync(file).toString('base64')}`;
    const ours = toData(oursFile, 'image/png');
    const ref = toData(REFERENCE, 'image/jpeg');
    const { context, page } = await newPage({ width: 2520, height: 760 });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff;font:600 15px Inter,Arial,sans-serif;color:#0F172A">
      <div style="display:flex;gap:20px;padding:0 0 0 0">
        <figure style="margin:0;width:1250px"><img src="${ours}" style="width:1250px;height:703px;object-fit:cover;display:block"><figcaption style="padding:8px 4px">Depot Twin /live (${prefix})</figcaption></figure>
        <figure style="margin:0;width:1250px"><img src="${ref}" style="width:1250px;height:703px;object-fit:cover;display:block"><figcaption style="padding:8px 4px">Reference: docs/reference/video/ui-ref-t09.jpg</figcaption></figure>
      </div></body></html>`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}vis-3d-compare.png` });
    console.log('shot vis-3d-compare');
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

if (offenders.length) {
  console.error('blocked non-localhost requests:', offenders);
  process.exitCode = 1;
}
console.log(`non-localhost requests: ${offenders.length}`);
if (problems.length) {
  console.log('console problems:', [...new Set(problems)]);
}
if (Object.keys(report).length) console.log('report:', JSON.stringify(report));
