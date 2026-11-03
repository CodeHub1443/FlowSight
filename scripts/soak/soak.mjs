/* global window, document, requestAnimationFrame -- page.evaluate callbacks */
// Long-running soak test of /live: headed Chrome on the GPU, mock mode, a simulated user, one sample every 30 s.
// Writes docs/soak/<run>/{samples.csv, meta.json, errors.log, actions.log, summary.md, chart.png}.
//
//   pnpm soak                                       1 hour: 50 min at 1x, 10 min at 60x, 1920x1080
//   pnpm soak --hours=12                            overnight: 10 h at 1x, 2 h at 60x
//   pnpm soak --phases=50m@1,10m@60 --viewport=3840x2160
//
// Flags: --hours, --phases, --viewport=WxH, --seed, --quality=auto|high|med|low, --warmup=<minutes>, --sample=<seconds>,
// --gc-every=<minutes>, --action-min and --action-max=<seconds>, --uncapped (no vsync), --out=<folder>, --no-build.
//
// It keeps the machine awake while it runs (Windows) and logs the name of the foreground process, never a window title.
// Ctrl+C ends the run early and still writes the report. Exit code 0 only when every pass criterion holds.
import { execSync, spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { build, preview } from 'vite';
import { writeReport } from './report.mjs';
import { csvLine, defaultPhases, median, parsePhases, percentile, seededRandom } from './stats.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const has = (flag) => args.includes(`--${flag}`);

const HOURS = Number(opt('hours', 1));
const PHASES = opt('phases', null) ? parsePhases(opt('phases')) : defaultPhases(HOURS);
const [VW, VH] = opt('viewport', '1920x1080').split('x').map(Number);
const SEED = Number(opt('seed', 1));
const QUALITY = opt('quality', 'auto');
const WARMUP_MIN = Number(opt('warmup', 10));
const SAMPLE_S = Number(opt('sample', 30));
const GC_EVERY_MIN = Number(opt('gc-every', 5));
const ACTION_MIN_S = Number(opt('action-min', 30));
const ACTION_MAX_S = Number(opt('action-max', 60));
const UNCAPPED = has('uncapped');
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUT_DIST = join(ROOT, 'node_modules', '.cache', 'soak-dist');
const PORT = Number(opt('port', 5190));
const stamp = new Date().toISOString().replaceAll(':', '-').slice(0, 19);
const RUN_ID = `${stamp}-${VW}x${VH}`;
const OUT = resolve(opt('out', join(ROOT, 'docs', 'soak', RUN_ID)));
mkdirSync(OUT, { recursive: true });

const COLUMNS = [
  'hours', 'speed', 'heapMB', 'heapAfterGcMB', 'workerHeapMB', 'domNodes', 'nodesAfterGc', 'listeners',
  'listenersAfterGc', 'documents', 'workers', 'geometries', 'textures', 'programs', 'calls', 'triangles',
  'frames', 'medianFps', 'meanFps', 'p95FrameMs', 'gpuMs', 'cpuMs', 'longTasks', 'tier', 'tierSteps', 'buffer', 'ratio',
  'errors', 'contextLost', 'nonLocal', 'actions', 'actionFailures', 'visible', 'focused', 'foreground',
  'liveBays', 'liveBayRxAt', 'liveActors', 'liveVisits', 'alertEvents', 'alertLifecycleAt', 'alertPending',
  'alertUnread', 'simEvents', 'simVisits', 'simBelt', 'simHourCounts', 'simSkuHour', 'simCurves', 'simIncidents',
]; // prettier-ignore

const log = (msg) => console.log(`${new Date().toISOString().slice(11, 19)} ${msg}`);
const csvPath = join(OUT, 'samples.csv');
const errorsPath = join(OUT, 'errors.log');
const actionsPath = join(OUT, 'actions.log');
writeFileSync(csvPath, `${COLUMNS.join(',')}\n`);
writeFileSync(errorsPath, '');
writeFileSync(actionsPath, '');

// ---- the machine: awake, and who is in front -------------------------------------------------------------------------

const AWAKE = `
Add-Type -Namespace Soak -Name U -MemberDefinition @'
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags);
'@
while ($true) {
  [void][Soak.U]::SetThreadExecutionState(0x80000003)
  $pid2 = [uint32]0
  [void][Soak.U]::GetWindowThreadProcessId([Soak.U]::GetForegroundWindow(), [ref]$pid2)
  try { (Get-Process -Id $pid2 -ErrorAction Stop).ProcessName } catch { 'none' }
  Start-Sleep -Seconds 10
}`;

let foreground = 'unknown';
function keepAwake() {
  if (process.platform !== 'win32') {
    log('not Windows: the machine must be kept awake by hand');
    return null;
  }
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', AWAKE], {
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  });
  child.stdout.on('data', (d) => {
    const line = String(d).trim().split(/\r?\n/).at(-1);
    if (line) foreground = line;
  });
  return child;
}

// ---- the page ---------------------------------------------------------------------------------------------------------

/** Frame timing, long tasks, a lost WebGL context, script time inside rAF. Light enough to leave on for days. */
function instrument() {
  const soak = { dt: [], last: 0, busy: 0, busyFrames: 0, longTasks: 0, contextLost: 0 };
  window.__soak = soak;
  const realRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) =>
    realRaf((t) => {
      const start = performance.now();
      cb(t);
      soak.busy += performance.now() - start;
    });
  const tick = (now) => {
    if (soak.last) soak.dt.push(now - soak.last);
    if (soak.dt.length > 60000) soak.dt.shift();
    soak.last = now;
    soak.busyFrames++;
    realRaf(tick);
  };
  realRaf(tick);
  new PerformanceObserver((list) => {
    soak.longTasks += list.getEntries().length;
  }).observe({ entryTypes: ['longtask'] });
  document.addEventListener('webglcontextlost', () => soak.contextLost++, true);
}

const readPage = (page) =>
  page.evaluate(async () => {
    const soak = window.__soak;
    const probe = window.__qualityProbe;
    const gl = probe?.renderer ?? null;
    const dt = soak.dt;
    soak.dt = [];
    const busy = soak.busy;
    const busyFrames = soak.busyFrames;
    soak.busy = 0;
    soak.busyFrames = 0;
    const longTasks = soak.longTasks;
    soak.longTasks = 0;
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    let oneFrame = { calls: null, triangles: null };
    if (gl) {
      // the composer renders several passes: count one whole frame by hand
      gl.info.autoReset = false;
      await frame();
      gl.info.reset();
      await frame();
      oneFrame = { calls: gl.info.render.calls, triangles: gl.info.render.triangles };
      gl.info.autoReset = true;
    }
    const badge = document.querySelector('[data-testid="quality-badge"]');
    return {
      dt,
      busy,
      busyFrames,
      longTasks,
      contextLost: soak.contextLost,
      geometries: gl?.info.memory.geometries ?? null,
      textures: gl?.info.memory.textures ?? null,
      programs: gl?.info.programs?.length ?? null,
      ...oneFrame,
      tier: badge?.dataset.tier ?? null,
      tierSteps: probe?.steps.length ?? 0,
      buffer: gl ? `${gl.domElement.width}x${gl.domElement.height}` : null,
      ratio: gl?.getPixelRatio() ?? null,
      visible: document.visibilityState === 'visible',
      focused: document.hasFocus(),
      stores: window.__soakProbe?.stores() ?? {},
      sim: await window.__soakProbe?.sim().catch(() => ({})),
    };
  });

/** Median GPU ms of a few whole frames (EXT_disjoint_timer_query_webgl2); null where the extension is absent. */
const gpuMs = (page, count = 30) =>
  page.evaluate(
    (n) =>
      new Promise((done) => {
        const gl = window.__qualityProbe?.renderer?.getContext();
        const ext = gl?.getExtension('EXT_disjoint_timer_query_webgl2');
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
            if (!gl.getParameter(ext.GPU_DISJOINT_EXT))
              ms.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
            gl.deleteQuery(q);
          }
          if (ms.length >= n || frames > n * 10) {
            for (const q of pending) gl.deleteQuery(q);
            ms.sort((a, b) => a - b);
            done(ms.length ? ms[Math.floor(ms.length / 2)] : null);
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

// ---- the simulated user -----------------------------------------------------------------------------------------------

const BAYS = ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07'];
const TABS = ['bays', 'trucks', 'alerts', 'captains'];
const PRESETS = ['plan', 'dockWall', 'stagingAisle', 'apron', 'floorOverview'];
const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

function userActions(page, random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  const click = (selector) => page.locator(selector).first().click({ timeout: 10_000 });
  const park = () => page.mouse.move(2, 2);
  const byTestId = (id) => `[data-testid="${id}"]`;
  return {
    async theme() {
      await click(byTestId('theme-toggle'));
    },
    async language() {
      const lang = await page.evaluate(() => document.documentElement.lang);
      await click(byTestId(lang === 'bn' ? 'language-en' : 'language-bn'));
    },
    async selectBay() {
      await click('#tray-tab-bays');
      await click(byTestId(`tray-bay-${pick(BAYS)}`));
      await sleep(3000);
      await click(byTestId('inspector-close'));
      await click(byTestId('map-home'));
    },
    async trayTabs() {
      for (const tab of TABS) {
        await click(`#tray-tab-${tab}`);
        await sleep(1500);
      }
      await click('#tray-tab-bays');
    },
    async preset() {
      const preset = pick(PRESETS);
      await page.evaluate((p) => window.__sceneCamera?.flyTo(p), preset);
      await sleep(3000);
      await click(byTestId('map-home'));
    },
    async arrowPan() {
      await page.locator(byTestId('scene-canvas')).focus();
      const key = pick(KEYS);
      await page.keyboard.down(key);
      await sleep(500 + random() * 1500);
      await page.keyboard.up(key);
      await sleep(1000);
      await click(byTestId('map-home'));
    },
    async rotate() {
      await click(byTestId(pick(['map-rotate-left', 'map-rotate-right'])));
      await sleep(1500);
      await click(byTestId('map-home'));
    },
    async alertBell() {
      await click(byTestId('alert-bell'));
      await sleep(2000);
      await page.keyboard.press('Escape');
    },
    park,
  };
}

// ---- the run ----------------------------------------------------------------------------------------------------------

function gitInfo() {
  try {
    return {
      commit: execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(),
      dirty: execSync('git status --porcelain', { cwd: ROOT }).toString().trim().length > 0,
    };
  } catch {
    return { commit: 'unknown', dirty: false };
  }
}

const LOCAL = new Set(['localhost', '127.0.0.1']);
const isLocal = (url) => {
  const u = new URL(url);
  return ['data:', 'blob:', 'about:'].includes(u.protocol) || LOCAL.has(u.hostname);
};

if (!has('no-build')) {
  log('building the debug bundle');
  process.env.VITE_DEBUG_PANEL = '1';
  await build({ root: ROOT, logLevel: 'warn', build: { outDir: OUT_DIST, emptyOutDir: true } });
}
const server = await preview({
  root: ROOT,
  logLevel: 'warn',
  build: { outDir: OUT_DIST },
  preview: { port: PORT, strictPort: true, host: '127.0.0.1' },
});

const awake = keepAwake();
const browser = await chromium.launch({
  headless: false,
  args: [
    '--use-angle=d3d11',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--force_high_performance_gpu',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-background-timer-throttling',
    '--disable-features=CalculateNativeWinOcclusion',
    '--enable-precise-memory-info',
    `--window-size=${VW + 16},${VH + 140}`,
    ...(UNCAPPED ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : []),
  ],
});
const context = await browser.newContext({
  viewport: { width: VW, height: VH },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

const totals = { errors: 0, nonLocal: 0, actions: 0, actionFailures: 0 };
const recordError = (kind, text) => {
  totals.errors++;
  appendFileSync(errorsPath, `${new Date().toISOString()} ${kind} ${text}\n`);
  log(`ERROR ${kind}: ${text.slice(0, 200)}`);
};
page.on('pageerror', (e) => recordError('pageerror', String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') recordError('console', m.text());
});
page.on('crash', () => recordError('crash', 'the page crashed'));
page.on('request', (r) => {
  if (!isLocal(r.url())) {
    totals.nonLocal++;
    appendFileSync(errorsPath, `${new Date().toISOString()} non-local ${r.url()}\n`);
  }
});
await page.route('**/*', (route) =>
  isLocal(route.request().url()) ? route.continue() : route.abort('blockedbyclient'),
);
await page.addInitScript(instrument);

const cdp = await context.newCDPSession(page);
await cdp.send('Performance.enable');
await cdp.send('HeapProfiler.enable');

log(`opening /live at ${VW}x${VH}, quality ${QUALITY}, ${UNCAPPED ? 'uncapped' : 'vsync'}`);
await page.goto(`http://127.0.0.1:${PORT}/live?quality=${QUALITY}`);
await page.bringToFront();
await page.getByTestId('tray-bay-B02').waitFor({ timeout: 180_000 });
await page.keyboard.press('Control+Shift+D');
const panel = page.getByRole('region', { name: 'Simulator' });
await panel.getByText('History ready').waitFor({ timeout: 180_000 });
await panel.getByLabel('Start at').selectOption('peak');
await sleep(4000);
await page.keyboard.press('Control+Shift+D');
await page.mouse.move(2, 2);

const renderer = await page.evaluate(() => {
  const gl = window.__qualityProbe?.renderer?.getContext();
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
});
log(`renderer ${renderer}`);
writeFileSync(
  join(OUT, 'meta.json'),
  JSON.stringify(
    {
      runId: RUN_ID,
      ...gitInfo(),
      renderer,
      viewport: `${VW}x${VH}`,
      quality: QUALITY,
      seed: SEED,
      uncapped: UNCAPPED,
      warmupMinutes: WARMUP_MIN,
      phases: PHASES,
      startedAt: new Date().toISOString(),
      platform: process.platform,
    },
    null,
    2,
  ),
);

const random = seededRandom(SEED);
const user = userActions(page, random);
const ACTION_ORDER = [
  'theme',
  'selectBay',
  'language',
  'trayTabs',
  'preset',
  'alertBell',
  'arrowPan',
  'rotate',
];
let actionIndex = 0;

async function doAction() {
  const name = ACTION_ORDER[actionIndex++ % ACTION_ORDER.length];
  totals.actions++;
  try {
    await user[name]();
    appendFileSync(actionsPath, `${new Date().toISOString()} ${name} ok\n`);
  } catch (e) {
    totals.actionFailures++;
    const first = String(e).split('\n')[0];
    appendFileSync(actionsPath, `${new Date().toISOString()} ${name} FAILED ${first}\n`);
    log(`action ${name} failed: ${first}`);
    // an open menu or dialog must not block the next one
    await page.keyboard.press('Escape').catch(() => {});
  }
  await user.park().catch(() => {});
}

const started = Date.now();
const endAt = started + PHASES.reduce((s, p) => s + p.minutes, 0) * 60_000;
let stopRequested = false;
process.on('SIGINT', () => {
  log('stopping: writing the report');
  stopRequested = true;
});

const phaseAt = (t) => {
  let at = started;
  for (const p of PHASES) {
    at += p.minutes * 60_000;
    if (t < at) return p;
  }
  return PHASES.at(-1);
};

async function metrics() {
  const { metrics: list } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(list.map((m) => [m.name, m.value]));
}

let lastGc = 0;
let workerHeapWarned = false;

async function sample(speed) {
  const t = Date.now();
  const row = { hours: +((t - started) / 3_600_000).toFixed(4), speed };
  const m = await metrics();
  row.heapMB = +(m.JSHeapUsedSize / 1048576).toFixed(2);
  row.domNodes = m.Nodes;
  row.listeners = m.JSEventListeners;
  row.documents = m.Documents;
  if (t - lastGc >= GC_EVERY_MIN * 60_000) {
    lastGc = t;
    await cdp.send('HeapProfiler.collectGarbage');
    const after = await metrics();
    row.heapAfterGcMB = +(after.JSHeapUsedSize / 1048576).toFixed(2);
    row.nodesAfterGc = after.Nodes;
    row.listenersAfterGc = after.JSEventListeners;
  }
  const workers = page.workers();
  row.workers = workers.length;
  for (const w of workers) {
    if (!w.url().includes('simulator')) continue;
    const used = await w
      .evaluate(() => performance.memory?.usedJSHeapSize ?? null)
      .catch(() => null);
    if (used !== null) row.workerHeapMB = +(used / 1048576).toFixed(2);
    else if (!workerHeapWarned) {
      workerHeapWarned = true;
      log('the simulator worker does not report its heap');
    }
  }
  const p = await readPage(page);
  const dts = p.dt;
  const med = median(dts);
  Object.assign(row, {
    frames: dts.length,
    medianFps: med ? +(1000 / med).toFixed(1) : 0,
    meanFps: dts.length ? +((1000 * dts.length) / dts.reduce((a, b) => a + b, 0)).toFixed(1) : 0,
    p95FrameMs: +(percentile(dts, 0.95) ?? 0).toFixed(2),
    cpuMs: p.busyFrames ? +(p.busy / p.busyFrames).toFixed(2) : '',
    longTasks: p.longTasks,
    contextLost: p.contextLost,
    geometries: p.geometries,
    textures: p.textures,
    programs: p.programs,
    calls: p.calls,
    triangles: p.triangles,
    tier: p.tier,
    tierSteps: p.tierSteps,
    buffer: p.buffer,
    ratio: p.ratio === null ? '' : +p.ratio.toFixed(4),
    visible: p.visible,
    focused: p.focused,
    foreground,
    ...p.stores,
    simEvents: p.sim?.events,
    simVisits: p.sim?.visits,
    simBelt: p.sim?.belt,
    simHourCounts: p.sim?.hourCounts,
    simSkuHour: p.sim?.skuHour,
    simCurves: p.sim?.curves,
    simIncidents: p.sim?.incidents,
    errors: totals.errors,
    nonLocal: totals.nonLocal,
    actions: totals.actions,
    actionFailures: totals.actionFailures,
  });
  const gpu = await gpuMs(page);
  row.gpuMs = gpu === null ? '' : +gpu.toFixed(2);
  appendFileSync(csvPath, `${csvLine(COLUMNS, row)}\n`);
  if (!p.visible) {
    log('the tab is not visible: bringing it to the front');
    await page.bringToFront().catch(() => {});
  }
  log(
    `${row.hours.toFixed(2)} h ${speed}x ${row.medianFps} fps p95 ${row.p95FrameMs} ms gpu ${row.gpuMs} ms heap ${row.heapMB} MB ` +
      `nodes ${row.domNodes} geo ${row.geometries} tex ${row.textures} tier ${row.tier} fg ${foreground}`,
  );
}

let speed = null;
let nextSample = started;
let nextAction = started + ACTION_MIN_S * 1000;
let pageFailed = false;
while (Date.now() < endAt && !stopRequested) {
  const now = Date.now();
  const phase = phaseAt(now);
  try {
    if (phase.speed !== speed) {
      speed = phase.speed;
      log(`speed ${speed}x`);
      await page.evaluate((s) => window.__soakProbe?.setSpeed(s), speed);
    }
    if (now >= nextSample) {
      nextSample = now + SAMPLE_S * 1000;
      await sample(speed);
    } else if (now >= nextAction) {
      nextAction = now + (ACTION_MIN_S + random() * (ACTION_MAX_S - ACTION_MIN_S)) * 1000;
      await doAction();
    } else {
      await sleep(Math.min(500, Math.max(10, Math.min(nextSample, nextAction) - now)));
    }
  } catch (e) {
    recordError('runner', String(e));
    if (page.isClosed()) {
      pageFailed = true;
      break;
    }
    await sleep(5000);
  }
}

if (pageFailed) log('the page closed early');
await browser.close().catch(() => {});
await server.close().catch(() => {});
awake?.kill();
const result = await writeReport(OUT);
log(`${result.pass ? 'PASS' : 'FAIL'}: ${join(OUT, 'summary.md')}`);
process.exit(result.pass ? 0 : 1);
