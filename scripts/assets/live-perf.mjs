/* global window, document, requestAnimationFrame, WebGL2RenderingContext -- page.evaluate callbacks */
// Frame rate, draw calls, triangles and screenshots of /live and the scene preview on a REAL GPU (not SwiftShader).
// Serves the production build (`dist/`, run `pnpm build` first) on port 5177, blocks every non-localhost request.
//
//   node scripts/assets/live-perf.mjs --gpu=intel --runs=3 --prefix=t11-before
//   node scripts/assets/live-perf.mjs --gpu=rtx   --runs=3 --prefix=t11-before --no-shots
//
// --gpu=intel: headless Chromium's default adapter on this hybrid laptop. --gpu=rtx: --force_high_performance_gpu.
// The adapter is read back from the WebGL renderer string and printed, so a run cannot be attributed to the wrong GPU.
// fps: mean of rAF intervals over `--secs` (default 8), pointer parked off the scene, Med pinned, 1920x1080, evening
// peak. Counts: GL calls of one frame on /live, plus renderer.info from the dev preview when `--info` is given.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer, preview } from 'vite';

const args = process.argv.slice(2);
const opt = (name, fallback) =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const has = (flag) => args.includes(`--${flag}`);

const GPU = opt('gpu', 'intel');
const RUNS = Number(opt('runs', 3));
const SECS = Number(opt('secs', 8));
const PREFIX = opt('prefix', 't11-perf');
const THEMES = opt('themes', 'light,dark').split(',');
const QUALITY = opt('quality', 'med');
const SHOTS = !has('no-shots');
const BLOCK_GLB = has('block-glb');
const SKIP_FPS = has('shots-only');
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUT = fileURLToPath(new URL('../../docs/screens/', import.meta.url));
const PORT = 5177;
const DEV_PORT = 5178;
const LOCAL = new Set(['localhost', '127.0.0.1']);
mkdirSync(OUT, { recursive: true });

const server = await preview({
  root: ROOT,
  logLevel: 'warn',
  preview: { port: PORT, strictPort: true, host: '127.0.0.1' },
});

const browser = await chromium.launch({
  args: [
    '--use-angle=d3d11',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
    ...(GPU === 'rtx' ? ['--force_high_performance_gpu'] : []),
  ],
});

const offenders = [];
async function newPage() {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (['data:', 'blob:', 'about:'].includes(u.protocol) || LOCAL.has(u.hostname)) {
      return route.continue();
    }
    offenders.push(u.href);
    return route.abort('blockedbyclient');
  });
  // --block-glb: the procedural fallback of the same build, for a same-camera "before" and the failure path. In the
  // page, because page.route does not see what the MSW service worker fetches.
  if (BLOCK_GLB) {
    await page.addInitScript(() => {
      const real = window.fetch;
      window.fetch = (input, init) => {
        const url = String(input?.url ?? input);
        return url.endsWith('.glb')
          ? Promise.reject(new TypeError('blocked by --block-glb'))
          : real.call(window, input, init);
      };
    });
  }
  // counts every GL draw of a frame without touching the app; the numbers include the post passes
  await page.addInitScript(() => {
    const stats = { calls: 0, tris: 0 };
    window.__glStats = stats;
    const add = (mode, count, instances = 1) => {
      stats.calls++;
      if (mode === 4) stats.tris += (count / 3) * instances;
    };
    const proto = WebGL2RenderingContext.prototype;
    const { drawArrays, drawElements, drawArraysInstanced, drawElementsInstanced } = proto;
    proto.drawArrays = function (m, f, c) {
      add(m, c);
      return drawArrays.call(this, m, f, c);
    };
    proto.drawElements = function (m, c, t, o) {
      add(m, c);
      return drawElements.call(this, m, c, t, o);
    };
    proto.drawArraysInstanced = function (m, f, c, n) {
      add(m, c, n);
      return drawArraysInstanced.call(this, m, f, c, n);
    };
    proto.drawElementsInstanced = function (m, c, t, o, n) {
      add(m, c, n);
      return drawElementsInstanced.call(this, m, c, t, o, n);
    };
  });
  return page;
}

const measure = (page, secs) =>
  page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const times = [];
        const start = performance.now();
        const tick = (now) => {
          times.push(now);
          if (now - start < ms) requestAnimationFrame(tick);
          else {
            const d = times.slice(1).map((t, i) => t - times[i]);
            d.sort((a, b) => a - b);
            resolve({
              fps: +((1000 * d.length) / (times[times.length - 1] - times[0])).toFixed(1),
              p95: +(d[Math.floor(d.length * 0.95)] ?? 0).toFixed(1),
            });
          }
        };
        requestAnimationFrame(tick);
      }),
    secs * 1000,
  );

/** GL calls and triangles of a few frames, averaged; the on-demand contact-shadow render has already settled. */
const glCounts = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const s = window.__glStats;
        let frames = 0;
        let first = true;
        let calls = 0;
        let tris = 0;
        const tick = () => {
          if (first) first = false;
          else {
            calls += s.calls;
            tris += s.tris;
            frames++;
          }
          s.calls = 0;
          s.tris = 0;
          if (frames < 10) requestAnimationFrame(tick);
          else resolve({ calls: Math.round(calls / frames), tris: Math.round(tris / frames) });
        };
        requestAnimationFrame(tick);
      }),
  );

async function rendererName(page) {
  return page.evaluate(() => {
    const c = document.querySelector('canvas');
    const gl = c?.getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
}

async function startPeak(page) {
  await page.keyboard.press('Control+Shift+D');
  const panel = page.getByRole('region', { name: 'Simulator' });
  await panel.getByText('History ready').waitFor({ timeout: 90_000 });
  await panel.getByLabel('Start at').selectOption('peak');
  await page.waitForTimeout(4000);
  await page.keyboard.press('Control+Shift+D');
}

const report = { gpu: GPU, quality: QUALITY, secs: SECS, runs: {} };
for (const theme of THEMES) {
  const page = await newPage();
  // uiStore has no persistence: the theme toggle lives in the shell, the URL only pins the tier
  await page.goto(`http://127.0.0.1:${PORT}/live?quality=${QUALITY}`);
  await page.getByTestId('tray-bay-B02').waitFor({ timeout: 90_000 });
  await startPeak(page);
  if (theme === 'dark') {
    await page
      .getByRole('button', { name: /theme|dark/i })
      .first()
      .click();
  }
  await page.mouse.move(2, 2);
  await page.waitForTimeout(4000);
  const renderer = await rendererName(page);
  const samples = [];
  if (!SKIP_FPS) for (let i = 0; i < RUNS; i++) samples.push(await measure(page, SECS));
  const counts = await glCounts(page);
  report.runs[theme] = { renderer, samples, counts };
  console.log(theme, renderer, JSON.stringify(samples), JSON.stringify(counts));
  if (SHOTS) {
    await page.screenshot({ path: `${OUT}${PREFIX}-${theme}-en-1920x1080.png` });
    // the tray row selects the bay and flies the camera to its preset
    await page.getByTestId('tray-bay-B04').click();
    await page.waitForTimeout(2500);
    await page.mouse.move(2, 2);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}${PREFIX}-bay-${theme}-en-1920x1080.png` });
  }
  await page.context().close();
}

await browser.close();
await server.close();

if (has('info')) {
  // renderer.info needs the dev preview's window.__sceneGl: Vite dev server, same scene, same tier
  const dev = await createServer({
    root: ROOT,
    logLevel: 'warn',
    server: { port: DEV_PORT, strictPort: true, host: '127.0.0.1' },
  });
  await dev.listen();
  const b2 = await chromium.launch({
    args: [
      '--use-angle=d3d11',
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      ...(GPU === 'rtx' ? ['--force_high_performance_gpu'] : []),
    ],
  });
  const page = await (await b2.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await page.goto(`http://127.0.0.1:${DEV_PORT}/scene-preview.html?quality=${QUALITY}`, {
    timeout: 240_000,
    waitUntil: 'commit',
  });
  await page.waitForFunction(() => window.__sceneGl !== undefined, undefined, { timeout: 120_000 });
  await page.waitForTimeout(5000);
  report.rendererInfo = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const gl = window.__sceneGl;
        gl.info.autoReset = false;
        gl.info.reset();
        requestAnimationFrame(() => {
          gl.info.reset();
          requestAnimationFrame(() => {
            resolve({
              calls: gl.info.render.calls,
              triangles: gl.info.render.triangles,
              geometries: gl.info.memory.geometries,
              textures: gl.info.memory.textures,
              programs: gl.info.programs?.length ?? null,
            });
            gl.info.autoReset = true;
          });
        });
      }),
  );
  console.log('renderer.info', JSON.stringify(report.rendererInfo));
  await b2.close();
  await dev.close();
}

if (offenders.length) console.log('NON-LOCAL REQUESTS', offenders);
report.offenders = offenders;
writeFileSync(`${process.env.TEMP ?? '.'}/${PREFIX}-${GPU}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
process.exit(0);
