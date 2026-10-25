/* global window, requestAnimationFrame -- used inside page.evaluate callbacks (browser context) */
// Screenshots the dev scene preview (scene-preview.html) at 1920x1080 into docs/screens/step-06-*.png and records
// frame timings. Starts Vite programmatically on port 5176 (strictPort), blocks every non-localhost request and
// closes everything on exit. Headless WebGL runs on SwiftShader, so frame times are NOT representative of a GPU.
//
//   node scripts/scene-shot.mjs            five required shots + frame timing
//   node scripts/scene-shot.mjs --extras   also dark theme, Bangla UI and the 3-bay east-face variant
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const PORT = 5176;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = fileURLToPath(new URL('../docs/screens/', import.meta.url));
const LOCAL = new Set(['localhost', '127.0.0.1']);
const SIZE = { width: 1920, height: 1080 };
const FLY_SETTLE_MS = 1600;
const extras = process.argv.includes('--extras');

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

async function openPage(query = '') {
  const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1 });
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
  await page.goto(`http://127.0.0.1:${PORT}/scene-preview.html${query}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await page.waitForSelector('canvas', { timeout: 120_000 });
  await page.waitForFunction(() => window.__sceneGl !== undefined, undefined, { timeout: 120_000 });
  await page.waitForTimeout(1500);
  return { context, page };
}

async function frameStats(page, ms = 3000) {
  return page.evaluate(
    (duration) =>
      new Promise((resolve) => {
        const times = [];
        let last = performance.now();
        const end = last + duration;
        const tick = (now) => {
          times.push(now - last);
          last = now;
          if (now < end) requestAnimationFrame(tick);
          else {
            const sorted = times.slice(2).sort((a, b) => a - b);
            const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;
            const info = window.__sceneGl.info;
            resolve({
              frames: sorted.length,
              avgMs: +avg.toFixed(1),
              p95Ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1),
              fps: +(1000 / avg).toFixed(1),
              drawCalls: info.render.calls,
              triangles: info.render.triangles,
              geometries: info.memory.geometries,
              textures: info.memory.textures,
            });
          }
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

try {
  const { context, page } = await openPage('?quality=high');
  const shots = [
    ['floor-overview', 'floorOverview'],
    ['dock-wall', 'dockWall'],
    ['bay-4', 'B04'],
    ['staging-aisle', 'stagingAisle'],
    ['apron', 'apron'],
  ];
  for (const [name, target] of shots) {
    if (target.startsWith('B')) await page.selectOption('select[aria-label="Bay"]', target);
    else await page.click(`[data-preset="${target}"]`);
    await page.waitForTimeout(FLY_SETTLE_MS);
    await page.screenshot({ path: `${OUT}step-06-${name}.png` });
    console.log(`shot ${name}`);
  }

  // click selection: B04 belt in the default view must select B04 (onSelect) and draw its ring
  await page.click('[data-preset="floorOverview"]');
  await page.waitForTimeout(FLY_SETTLE_MS);
  await page.mouse.click(985, 520);
  await page.waitForTimeout(500);
  const picked = await page.getAttribute('[data-testid="scene-controls"]', 'data-selected');
  console.log(`click at B04 belt selected: ${picked}`);
  if (picked !== 'B04') process.exitCode = 1;
  await page.screenshot({ path: `${OUT}step-06-selected-bay.png` });

  // frame timing from the default view at High and Low
  const timings = {};
  for (const tier of ['high', 'low']) {
    await page.click('[data-preset="floorOverview"]');
    await page.waitForTimeout(FLY_SETTLE_MS);
    await page.selectOption('select[aria-label="Quality"]', tier);
    await page.waitForTimeout(1500);
    timings[tier] = await frameStats(page);
  }
  console.log('frame timing (headless SwiftShader, not representative):', JSON.stringify(timings));
  await context.close();

  if (extras) {
    const variants = [
      ['dark', '?quality=high&theme=dark'],
      ['bn', '?quality=high'],
      ['variant-east3', '?quality=high&site=east3'],
    ];
    for (const [name, query] of variants) {
      const v = await openPage(query);
      if (name === 'bn') {
        await v.page.click('text=বাং');
        await v.page.waitForTimeout(500);
      }
      await v.page.screenshot({ path: `${OUT}step-06-${name}.png` });
      console.log(`shot ${name}`);
      await v.context.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}

if (offenders.length) {
  console.error('blocked non-localhost requests:', offenders);
  process.exitCode = 1;
}
if (problems.length) {
  console.log('console problems:', [...new Set(problems)]);
}
