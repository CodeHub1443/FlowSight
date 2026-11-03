/* global window, document, requestAnimationFrame, createImageBitmap -- page.evaluate callbacks */
// Before/after check of the pixel budget (Task 17) on the real GPU. Serves two debug builds side by side:
//
//   VITE_DEBUG_PANEL=1 pnpm exec vite build --outDir <before>     (on the commit to compare with)
//   VITE_DEBUG_PANEL=1 pnpm exec vite build --outDir <after>
//   node scripts/pixel-budget/compare.mjs --before=<dir> --after=<dir> --check=identity,perf,shots
//
// identity  (--control: after against after, the noise floor of the page hash.) The simulator is stubbed, so the scene is the empty shed and nothing moves. Canvas pixels (read back in the
//           frame they were drawn) and the whole page (clock masked, dev badge hidden) must hash the same in both builds,
//           for every tier and theme at 1920x1080 and 1366x768.
// perf      Evening peak, uncapped: drawing buffer, GPU ms per frame (EXT_disjoint_timer_query_webgl2), fps, p95.
// shots     100 % crops and full pages into docs/screens/t17-*.
//
// A run cannot be attributed to the wrong GPU: the WebGL renderer string is read back and printed.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const args = process.argv.slice(2);
const opt = (name, fallback) =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

const BEFORE = resolve(opt('before', 'dist-before'));
const AFTER = resolve(opt('after', 'dist'));
const CHECKS = opt('check', 'identity,perf,shots').split(',');
const TIERS = opt('tiers', 'low,med,high').split(',');
const THEMES = opt('themes', 'light,dark').split(',');
const SECS = Number(opt('secs', 10));
const OUT_JSON = opt('json', null);
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SCREENS = fileURLToPath(new URL('../../docs/screens/', import.meta.url));
const LOCAL = new Set(['localhost', '127.0.0.1']);
const PORTS = { before: 5181, after: 5182 };
/** The middle of the shed at 3840x2160: bays, crews and pills. */
const CROP = { x: 1500, y: 700, width: 1000, height: 620 };
mkdirSync(SCREENS, { recursive: true });

async function serve(outDir, port) {
  return preview({
    root: ROOT,
    logLevel: 'warn',
    build: { outDir },
    preview: { port, strictPort: true, host: '127.0.0.1' },
  });
}

const servers = [await serve(BEFORE, PORTS.before), await serve(AFTER, PORTS.after)];
const browser = await chromium.launch({
  args: [
    '--use-angle=d3d11',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
    '--force_high_performance_gpu',
  ],
});
const offenders = [];

async function openLive(build, { width, height, scale = 1, tier, theme, pixels = null, stub }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
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
  await page.addInitScript((t) => {
    window.localStorage.setItem('depot.pref.theme', t);
  }, theme);
  if (stub) {
    // a simulator that never answers: no data, so no actor, truck or number ever moves
    await page.addInitScript(() => {
      const Real = window.Worker;
      window.Worker = function (url, opts) {
        if (!String(url).includes('simulator')) return new Real(url, opts);
        return { postMessage() {}, terminate() {}, onmessage: null };
      };
    });
  }
  const q = new URLSearchParams({ quality: tier });
  if (pixels !== null) q.set('pixels', String(pixels));
  await page.goto(`http://127.0.0.1:${PORTS[build]}/live?${q}`);
  await page.waitForFunction(
    () => document.querySelector('[data-scene-ready="true"] canvas'),
    null,
    {
      timeout: 120_000,
    },
  );
  await page.mouse.move(2, 2);
  return page;
}

async function startPeak(page) {
  await page.keyboard.press('Control+Shift+D');
  const panel = page.getByRole('region', { name: 'Simulator' });
  await panel.getByText('History ready').waitFor({ timeout: 120_000 });
  await panel.getByLabel('Start at').selectOption('peak');
  await page.waitForTimeout(4000);
  await page.keyboard.press('Control+Shift+D');
  await page.mouse.move(2, 2);
}

/** The drawing buffer and the canvas box, as the page sees them. */
const bufferInfo = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    const gl = c.getContext('webgl2');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      bufferW: c.width,
      bufferH: c.height,
      drawingW: gl.drawingBufferWidth,
      drawingH: gl.drawingBufferHeight,
      cssW: r.width,
      cssH: r.height,
      deviceDpr: window.devicePixelRatio,
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown',
    };
  });

/** FNV-1a of the canvas pixels, read in the frame they were drawn (this rAF callback runs after R3F's). */
const canvasHash = (page) =>
  page.evaluate(
    () =>
      new Promise((resolvePromise) => {
        requestAnimationFrame(() => {
          const c = document.querySelector('canvas');
          const copy = document.createElement('canvas');
          copy.width = c.width;
          copy.height = c.height;
          const g = copy.getContext('2d', { willReadFrequently: true });
          g.drawImage(c, 0, 0);
          const { data } = g.getImageData(0, 0, copy.width, copy.height);
          let h = 0x811c9dc5;
          let opaque = 0;
          for (let i = 0; i < data.length; i += 4) {
            h = Math.imul(h ^ data[i], 16777619);
            h = Math.imul(h ^ data[i + 1], 16777619);
            h = Math.imul(h ^ data[i + 2], 16777619);
            if (data[i + 3] === 255) opaque++;
          }
          resolvePromise({ hash: (h >>> 0).toString(16), opaque, size: data.length / 4 });
        });
      }),
  );

async function pageHash(page) {
  // the dev badge is not part of the product and its text differs between the builds: out of the picture, not masked
  await page.addStyleTag({
    content: '[data-testid="quality-badge"] { visibility: hidden !important; }',
  });
  const mask = [page.getByTestId('mode-clock')];
  const png = await page.screenshot({ mask, maskColor: '#000000', animations: 'disabled' });
  return { hash: createHash('sha256').update(png).digest('hex').slice(0, 16), png };
}

/** Where two screenshots differ: decoded in a blank page, because a hash cannot say. */
async function pngDiff(a, b) {
  const page = await browser.newPage();
  const result = await page.evaluate(
    async ([x, y]) => {
      const load = async (b64) => {
        const img = await createImageBitmap(
          await (await fetch(`data:image/png;base64,${b64}`)).blob(),
        );
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, img.width, img.height);
      };
      const [p, q] = [await load(x), await load(y)];
      let count = 0;
      let maxDelta = 0;
      const box = [Infinity, Infinity, -1, -1];
      for (let i = 0; i < p.data.length; i += 4) {
        const d = Math.max(
          Math.abs(p.data[i] - q.data[i]),
          Math.abs(p.data[i + 1] - q.data[i + 1]),
          Math.abs(p.data[i + 2] - q.data[i + 2]),
        );
        if (d === 0) continue;
        count++;
        maxDelta = Math.max(maxDelta, d);
        const px = (i / 4) % p.width;
        const py = Math.floor(i / 4 / p.width);
        box[0] = Math.min(box[0], px);
        box[1] = Math.min(box[1], py);
        box[2] = Math.max(box[2], px);
        box[3] = Math.max(box[3], py);
      }
      return { count, maxDelta, box };
    },
    [a.toString('base64'), b.toString('base64')],
  );
  await page.close();
  return result;
}

/** Median and mean GPU ms of `count` whole frames: each query spans one R3F frame, from after one to after the next. */
const gpuTimes = (page, count) =>
  page.evaluate(
    (n) =>
      new Promise((done) => {
        const gl = document.querySelector('canvas').getContext('webgl2');
        const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
        if (!ext) {
          done(null);
          return;
        }
        const pending = [];
        const ms = [];
        let current = null;
        let frames = 0;
        const tick = () => {
          if (current) {
            gl.endQuery(ext.TIME_ELAPSED_EXT);
            pending.push(current);
            current = null;
          }
          while (pending[0] && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
            const q = pending.shift();
            if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
              ms.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
            }
            gl.deleteQuery(q);
          }
          if (ms.length >= n || frames > n * 20) {
            ms.sort((a, b) => a - b);
            done({
              n: ms.length,
              median: +(ms[Math.floor(ms.length / 2)] ?? 0).toFixed(2),
              p95: +(ms[Math.floor(ms.length * 0.95)] ?? 0).toFixed(2),
            });
            return;
          }
          frames++;
          current = gl.createQuery();
          gl.beginQuery(ext.TIME_ELAPSED_EXT, current);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    count,
  );

const frameTimes = (page, secs) =>
  page.evaluate(
    (ms) =>
      new Promise((done) => {
        const times = [];
        const start = performance.now();
        const tick = (now) => {
          times.push(now);
          if (now - start < ms) requestAnimationFrame(tick);
          else {
            const d = times.slice(1).map((t, i) => t - times[i]);
            d.sort((a, b) => a - b);
            done({
              fps: +((1000 * d.length) / (times[times.length - 1] - times[0])).toFixed(1),
              p95: +(d[Math.floor(d.length * 0.95)] ?? 0).toFixed(1),
            });
          }
        };
        requestAnimationFrame(tick);
      }),
    secs * 1000,
  );

const report = { identity: [], perf: [], shots: [] };

if (CHECKS.includes('identity')) {
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
  ]) {
    for (const tier of TIERS) {
      for (const theme of THEMES) {
        const seen = {};
        for (const [slot, build] of [
          ['before', opt('control', null) ? 'after' : 'before'],
          ['after', 'after'],
        ]) {
          const page = await openLive(build, { width, height, tier, theme, stub: true });
          // shutters, fades and the first contact-shadow passes settle
          await page.waitForTimeout(6000);
          const first = await canvasHash(page);
          await page.waitForTimeout(1500);
          const second = await canvasHash(page);
          const shot = await pageHash(page);
          seen[slot] = {
            ...(await bufferInfo(page)),
            canvas: second.hash,
            stable: first.hash === second.hash,
            opaque: second.opaque === second.size,
            page: shot.hash,
            png: shot.png,
          };
          await page.context().close();
        }
        const row = {
          size: `${width}x${height}`,
          tier,
          theme,
          buffer: `${seen.after.bufferW}x${seen.after.bufferH}`,
          bufferSame:
            seen.before.bufferW === seen.after.bufferW &&
            seen.before.bufferH === seen.after.bufferH,
          canvasSame: seen.before.canvas === seen.after.canvas,
          pageSame: seen.before.page === seen.after.page,
          stable: seen.before.stable && seen.after.stable,
          canvas: seen.after.canvas,
          pageDiff:
            seen.before.page === seen.after.page
              ? null
              : await pngDiff(seen.before.png, seen.after.png),
        };
        report.identity.push(row);
        console.log('identity', JSON.stringify(row));
        if (row.pageDiff && opt('dump', null)) {
          const name = `${opt('label', 'diff')}-${row.size}-${tier}-${theme}-${Date.now()}`;
          mkdirSync(opt('dump', null), { recursive: true });
          writeFileSync(resolve(opt('dump', null), `${name}-a.png`), seen.before.png);
          writeFileSync(resolve(opt('dump', null), `${name}-b.png`), seen.after.png);
        }
      }
    }
  }
}

if (CHECKS.includes('themecycle')) {
  // The environment map after theme switches must equal a fresh load in that theme, in the old build and the new one.
  const toggle = async (page) => {
    await page
      .getByRole('button', { name: /dark|light/i })
      .first()
      .click();
    await page.mouse.move(2, 2);
    await page.waitForTimeout(3000);
  };
  for (const tier of TIERS) {
    const hashes = {};
    for (const build of ['before', 'after']) {
      const page = await openLive(build, {
        width: 1366,
        height: 768,
        tier,
        theme: 'light',
        stub: true,
      });
      await page.waitForTimeout(6000);
      hashes[`${build}-light`] = (await canvasHash(page)).hash;
      await toggle(page);
      hashes[`${build}-dark1`] = (await canvasHash(page)).hash;
      await toggle(page);
      hashes[`${build}-light2`] = (await canvasHash(page)).hash;
      await toggle(page);
      hashes[`${build}-dark2`] = (await canvasHash(page)).hash;
      await page.context().close();
      const fresh = await openLive(build, {
        width: 1366,
        height: 768,
        tier,
        theme: 'dark',
        stub: true,
      });
      await fresh.waitForTimeout(6000);
      hashes[`${build}-freshDark`] = (await canvasHash(fresh)).hash;
      await fresh.context().close();
    }
    const same = Object.keys(hashes)
      .filter((k) => k.startsWith('before-'))
      .every((k) => hashes[k] === hashes[k.replace('before-', 'after-')]);
    const row = { tier, same, hashes };
    report.identity.push({
      ...row,
      bufferSame: true,
      canvasSame: same,
      pageSame: true,
      stable: true,
    });
    console.log('themecycle', JSON.stringify(row));
  }
}

if (CHECKS.includes('perf')) {
  const sizes = opt('sizes', '1920x1080@1,3840x2160@1,3840x2160@2').split(',');
  for (const spec of sizes) {
    const [wh, s] = spec.split('@');
    const [width, height] = wh.split('x').map(Number);
    const scale = Number(s);
    for (const tier of TIERS) {
      const runs = opt('pixels', '')
        ? opt('pixels', '')
            .split(',')
            .map((p) => ['after', Number(p)])
        : [
            ['before', null],
            ['after', null],
          ];
      for (const [build, pixels] of runs) {
        const page = await openLive(build, {
          width,
          height,
          scale,
          tier,
          theme: 'light',
          pixels,
          stub: false,
        });
        await page.getByTestId('tray-bay-B02').waitFor({ timeout: 120_000 });
        await startPeak(page);
        await page.waitForTimeout(3000);
        const info = await bufferInfo(page);
        const frames = await frameTimes(page, SECS);
        const gpu = await gpuTimes(page, 120);
        const row = {
          build,
          pixels,
          size: spec,
          tier,
          buffer: `${info.drawingW}x${info.drawingH}`,
          mp: +((info.drawingW * info.drawingH) / 1e6).toFixed(2),
          css: `${info.cssW}x${info.cssH}`,
          gpuMs: gpu?.median ?? null,
          gpuP95: gpu?.p95 ?? null,
          ...frames,
          renderer: info.renderer,
        };
        report.perf.push(row);
        console.log('perf', JSON.stringify(row));
        await page.context().close();
      }
    }
  }
}

if (CHECKS.includes('shots')) {
  for (const theme of THEMES) {
    for (const build of ['before', 'after']) {
      const page = await openLive(build, {
        width: 1920,
        height: 1080,
        tier: 'med',
        theme,
        stub: true,
      });
      await page.waitForTimeout(6000);
      await page.addStyleTag({
        content: '[data-testid="quality-badge"] { visibility: hidden !important; }',
      });
      await page.screenshot({ path: `${SCREENS}t17-1080p-${theme}-${build}.png` });
      await page.context().close();
    }
  }
  for (const [width, height, name] of [
    [3840, 2160, '3840x2160'],
    [1920, 1080, '1920x1080'],
  ]) {
    const page = await openLive('after', {
      width,
      height,
      tier: 'med',
      theme: 'light',
      stub: true,
    });
    await page.waitForTimeout(2000);
    await page.getByTestId('quality-badge').screenshot({ path: `${SCREENS}t17-badge-${name}.png` });
    await page.context().close();
  }
  for (const theme of THEMES) {
    for (const scale of [1, 2]) {
      for (const build of ['before', 'after']) {
        const page = await openLive(build, {
          width: 3840,
          height: 2160,
          scale,
          tier: 'med',
          theme,
          stub: false,
        });
        await page.getByTestId('tray-bay-B02').waitFor({ timeout: 120_000 });
        await startPeak(page);
        await page.waitForTimeout(3000);
        await page.evaluate(() => document.fonts.ready);
        const name = `t17-4k-${theme}-dpr${scale}-${build}`;
        await page.screenshot({ path: `${SCREENS}${name}-crop.png`, clip: CROP });
        if (scale === 1) await page.screenshot({ path: `${SCREENS}${name}-full.png` });
        const info = await bufferInfo(page);
        report.shots.push({ name, buffer: `${info.drawingW}x${info.drawingH}` });
        console.log('shot', name, `${info.drawingW}x${info.drawingH}`, info.renderer);
        await page.context().close();
      }
    }
  }
}

await browser.close();
await Promise.all(servers.map((s) => s.close()));
if (offenders.length) console.log('NON-LOCAL REQUESTS', offenders);
report.offenders = offenders;
if (OUT_JSON) writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
const bad = report.identity.filter(
  (r) => !(r.bufferSame && r.canvasSame && r.pageSame && r.stable),
);
console.log(`identity rows ${report.identity.length}, not identical ${bad.length}`);
if (bad.length) console.log(JSON.stringify(bad, null, 1));
process.exit(bad.length || offenders.length ? 1 : 0);
