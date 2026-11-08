import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { CDPSession, Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Task 21: leaving /live and coming back must not leak. Before the fix every visit kept the dead WebGLRenderer, its
// canvas and the whole detached /live DOM tree (about 900 nodes) alive through the 'dispose' listeners three.js leaves
// on shared materials, geometries and textures (src/scene/gpuRelease.ts). Ten client-side cycles /live -> /trucks ->
// /live by default, measured after forced GC against the first visit, with the debug probes the soak run reads.
//
// Gates (Task 21 architect decision). The counts are the strict leak gate: nodes within +3 %, listeners within +5 %, ALL
// canvases in the heap (detached included) equal to the start, renderer geometries and textures equal, at every checked cycle.
// The 10-cycle heap is only a sanity ceiling (+5 MB over the settled start; it was +4 MB, which left under 1 MB of headroom
// over the observed +3.2 to +3.9 MB and flaked in practice): over the first visits the heap is dominated by warm-up (JIT code,
// Chrome's capped timing buffers, renderer state; it peaks near cycle 15, then levels off), so at 10 cycles a leak (+6.6 MB
// before the fix) and the fix cannot be told apart. The counts can, and so can the slope after the warm-up: T21_LONG=1 runs
// 50 cycles and is the authoritative heap gate, a slope under 0.1 MB per cycle over cycles 20 to 50 and at most +3 MB over the
// settled start at cycle 50.
// Settle: before the start sample (both modes) the heap is polled every 2 s after forced GC until two consecutive samples
// differ by under 0.3 MB (cap 30 s, reported if hit), so the start is not taken while the first visit is still allocating.
// Nav latency (information, not a gate): each cycle times the push to /trucks until the scene canvas has left the document
// (in-page performance.now deltas), with a 120 s backstop; a cycle over 5 s gets a 'slow-nav' annotation. In SwiftShader
// the leave takes about 10 s (median 9.5 to 13 s, CPU about 10 %), and that is unexplained. Browser throttling flags were
// tried and do not matter in headless mode (no window; Playwright already passes them), so playwright.config.ts is
// unchanged. The router transition (BrowserRouter wraps navigation in startTransition) is an unverified hypothesis.
// Every heap sample and every leave time is printed when it is taken and appended to test-results/t21-nav-leak.log, so a
// late failure keeps the numbers.
// docs/progress/t21.md has the numbers.

/** The part of the quality probe (src/scene/qualityProbe.ts) read here; auto-quality.spec declares its own part. */
interface RendererProbe {
  __qualityProbe?: {
    renderer: { info: { memory: { geometries: number; textures: number } } } | null;
  };
}

declare global {
  interface Window {
    __t21ContextLost?: number;
    __t21Gone?: number;
    __soakProbe?: unknown;
    /** 22B.2 timeline instrumentation (informational; not a gate). */
    __t21RouteVisible?: number;
    __t21LongTaskMs?: number;
    __t21LongTaskCount?: number;
  }
}

const LONG = process.env.T21_LONG === '1';
const CYCLES = LONG ? 50 : 10;
/** Long mode: the slope is taken over these cycles, after the warm-up. */
const SLOPE_FROM = 20;
/** Heap ceiling over the settled start, by checked cycle: a sanity check at 10, the real one at 50 (long mode). */
const HEAP_CEILING_MB: Readonly<Record<number, number>> = { 10: 5, 50: 3 };
const MAX_SLOPE_MB = 0.1;
const SETTLE_POLL_MS = 2000;
const SETTLE_DELTA_MB = 0.3;
const SETTLE_CAP_MS = 30_000;
/** How long the scene canvas may take to leave after the push to /trucks: a backstop, not part of the gate. */
const LEAVE_TIMEOUT_MS = 120_000;
/** A leave slower than this is annotated 'slow-nav'. */
const SLOW_NAV_MS = 5000;

/** Least-squares slope of heap MB over cycle number. */
function slope(points: readonly (readonly [number, number])[]): number {
  const n = points.length;
  const sx = points.reduce((s, [x]) => s + x, 0);
  const sy = points.reduce((s, [, y]) => s + y, 0);
  const sxx = points.reduce((s, [x]) => s + x * x, 0);
  const sxy = points.reduce((s, [x, y]) => s + x * y, 0);
  return (n * sxy - sx * sy) / (n * sxx - sx * sx);
}

interface Sample {
  nodes: number;
  listeners: number;
  heapMB: number;
  canvases: number;
  geometries: number;
  textures: number;
}

async function sample(page: Page, cdp: CDPSession): Promise<Sample> {
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const { metrics } = await cdp.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  // every canvas in the heap, attached or not; the object group is released, or it would hold them itself
  const { result: proto } = await cdp.send('Runtime.evaluate', {
    expression: 'HTMLCanvasElement.prototype',
    objectGroup: 't21',
  });
  const { objects } = await cdp.send('Runtime.queryObjects', {
    prototypeObjectId: proto.objectId ?? '',
    objectGroup: 't21',
  });
  const { result: count } = await cdp.send('Runtime.callFunctionOn', {
    objectId: objects.objectId ?? '',
    functionDeclaration: 'function () { return this.length; }',
    returnByValue: true,
    objectGroup: 't21',
  });
  await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 't21' });
  const memory = await page.evaluate(
    () => (window as Window & RendererProbe).__qualityProbe?.renderer?.info.memory,
  );
  return {
    nodes: m.Nodes ?? 0,
    listeners: m.JSEventListeners ?? 0,
    heapMB: (m.JSHeapUsedSize ?? 0) / 1048576,
    canvases: Number(count.value),
    geometries: memory?.geometries ?? -1,
    textures: memory?.textures ?? -1,
  };
}

/** Forced-GC heap, polled every 2 s until two consecutive samples differ by under 0.3 MB, or the 30 s cap. */
async function settle(cdp: CDPSession) {
  const heapMB = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('HeapProfiler.collectGarbage');
    const { metrics } = await cdp.send('Performance.getMetrics');
    return (metrics.find((x) => x.name === 'JSHeapUsedSize')?.value ?? 0) / 1048576;
  };
  const t0 = Date.now();
  const heaps = [await heapMB()];
  for (;;) {
    if (Date.now() - t0 >= SETTLE_CAP_MS) return { ms: Date.now() - t0, capHit: true, heaps };
    await new Promise((r) => setTimeout(r, SETTLE_POLL_MS));
    heaps.push(await heapMB());
    const [a = 0, b = 0] = heaps.slice(-2);
    if (Math.abs(b - a) < SETTLE_DELTA_MB) return { ms: Date.now() - t0, capHit: false, heaps };
  }
}

async function go(page: Page, path: string) {
  await page.evaluate((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

/**
 * 22B.2 timeline instrumentation (informational, not a gate): a long-task accumulator (reset per cycle by the
 * caller reading and zeroing it) and a second MutationObserver marking the moment the destination route's own
 * content (the /trucks placeholder's path text) is visible, distinct from the scene canvas leaving (below).
 */
async function armRouteVisible(page: Page, path: string) {
  await page.evaluate((p) => {
    window.__t21RouteVisible = undefined;
    const visible = () =>
      document.querySelector('[data-testid="placeholder-path"]')?.textContent === p;
    const observer = new MutationObserver(() => {
      if (!visible()) return;
      window.__t21RouteVisible = performance.now();
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    if (visible()) {
      window.__t21RouteVisible = performance.now();
      observer.disconnect();
    }
  }, path);
}

/**
 * Pushes `path` and resolves with the in-page performance.now() of the push. A MutationObserver set up first stores in
 * window.__t21Gone the performance.now() at which the scene canvas is no longer in the document.
 */
async function leave(page: Page, path: string): Promise<number> {
  await armRouteVisible(page, path);
  return page.evaluate((p) => {
    window.__t21Gone = undefined;
    const gone = () => !document.querySelector('[data-testid="scene-canvas"]');
    const observer = new MutationObserver(() => {
      if (!gone()) return;
      window.__t21Gone = performance.now();
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const t0 = performance.now();
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
    if (gone()) {
      window.__t21Gone = performance.now();
      observer.disconnect();
    }
    return t0;
  }, path);
}

/** GPU memory (geometries+textures) back to the settled-start baseline, polled after the canvas has left the DOM. */
async function waitGpuReleased(
  page: Page,
  baseline: { geometries: number; textures: number },
  timeoutMs = 10_000,
): Promise<number | null> {
  const t0 = Date.now();
  for (;;) {
    const mem = await page.evaluate(
      () => (window as Window & RendererProbe).__qualityProbe?.renderer?.info.memory ?? null,
    );
    if (mem && mem.geometries === baseline.geometries && mem.textures === baseline.textures) {
      return Date.now() - t0; // ms since polling started (just after the canvas left the DOM)
    }
    if (Date.now() - t0 > timeoutMs) return null;
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** Prints a line and appends it to test-results/t21-nav-leak.log. */
function log(line: string) {
  console.log(line);
  const dir = test.info().project.outputDir;
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, 't21-nav-leak.log'), `${line}\n`);
}

async function sceneReady(page: Page) {
  await expect(page.locator('[data-testid="scene-canvas"][data-scene-ready="true"]')).toHaveCount(
    1,
    { timeout: 60_000 },
  );
  // a few frames, so every lazy texture and program of the visit exists before it is measured
  await page.waitForTimeout(1500);
}

test(`${CYCLES} visits to /live leak no DOM, listeners, canvases or heap`, async ({ page }) => {
  // matches the backstop: every cycle may use the whole leave wait plus a full scene-ready wait, plus the settle cap
  test.setTimeout(CYCLES * (LEAVE_TIMEOUT_MS + 90_000) + SETTLE_CAP_MS + 120_000);
  const warnings: string[] = [];
  page.on('console', (msg) => {
    if (/too many active webgl contexts|context lost/i.test(msg.text())) warnings.push(msg.text());
  });
  // only a canvas still in the document counts: R3F loses the context of the canvas it has just unmounted on purpose
  await page.addInitScript(() => {
    window.__t21ContextLost = 0;
    document.addEventListener(
      'webglcontextlost',
      () => (window.__t21ContextLost = (window.__t21ContextLost ?? 0) + 1),
      true,
    );
  });
  // 22B.2 timeline instrumentation (informational, not a gate): total long-task time and count since the page
  // loaded; the per-cycle log reads and resets both so each cycle reports only its own share.
  await page.addInitScript(() => {
    window.__t21LongTaskMs = 0;
    window.__t21LongTaskCount = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__t21LongTaskMs = (window.__t21LongTaskMs ?? 0) + entry.duration;
        window.__t21LongTaskCount = (window.__t21LongTaskCount ?? 0) + 1;
      }
    }).observe({ entryTypes: ['longtask'] });
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.enable');

  await page.goto('/live');
  await sceneReady(page);
  expect(await page.evaluate(() => typeof window.__soakProbe)).toBe('object');
  const settled = await settle(cdp);
  const heaps = settled.heaps.map((h) => h.toFixed(2)).join(', ');
  log(
    `t21 ${CYCLES} cycles, settle ${settled.ms} ms${settled.capHit ? ' (CAP HIT)' : ''}: ${heaps} MB`,
  );
  if (settled.capHit) {
    test.info().annotations.push({ type: 't21-settle-cap', description: `${heaps} MB` });
  }
  const start = await sample(page, cdp);
  log(`t21 start ${JSON.stringify(start)}`);

  const checked = new Map<number, Sample>();
  const navMs: number[] = [];
  for (let i = 1; i <= CYCLES; i++) {
    await page.evaluate(() => {
      window.__t21LongTaskMs = 0;
      window.__t21LongTaskCount = 0;
    });
    const pushedAt = await leave(page, '/trucks');
    await expect(page.getByTestId('scene-canvas')).toHaveCount(0, { timeout: LEAVE_TIMEOUT_MS });
    const goneAt = await page.evaluate(() => window.__t21Gone ?? performance.now());
    const ms = goneAt - pushedAt;
    navMs.push(ms);
    // 22B.2 timeline (informational): (a) push is t=0 by construction; (b) route visible; (c) canvas gone
    // (same value as goneAt above); (d) GPU memory back to the start baseline, polled after (c); (e) the
    // spec's own 'left' condition is (c) itself (the scene-canvas assertion above).
    const routeVisibleAt = await page.evaluate(() => window.__t21RouteVisible ?? null);
    const lt = await page.evaluate(() => ({
      ms: window.__t21LongTaskMs ?? 0,
      count: window.__t21LongTaskCount ?? 0,
    }));
    const gpuMsAfterGone = await waitGpuReleased(
      page,
      { geometries: start.geometries, textures: start.textures },
      10_000,
    );
    log(
      `t21 timeline cycle ${i}: push=0 routeVisible=${routeVisibleAt === null ? 'n/a' : (routeVisibleAt - pushedAt).toFixed(0)} canvasGone=${ms.toFixed(0)} gpuReleased=${gpuMsAfterGone === null ? 'n/a(>10s after gone)' : `+${gpuMsAfterGone}afterGone`} longTasks=${lt.count} (${lt.ms.toFixed(0)} ms) [all ms relative to the push, except gpuReleased which is relative to the canvas leaving]`,
    );
    log(`t21 nav cycle ${i}: ${ms.toFixed(0)} ms`);
    if (ms > SLOW_NAV_MS) {
      test
        .info()
        .annotations.push({ type: 'slow-nav', description: `cycle ${i}: ${ms.toFixed(0)} ms` });
    }
    await page.waitForTimeout(800);
    await go(page, '/live');
    await sceneReady(page);
    if (i === 10 || i === CYCLES || (LONG && i >= SLOPE_FROM && i % 5 === 0)) {
      const s = await sample(page, cdp);
      checked.set(i, s);
      log(
        `t21 cycle ${i} ${JSON.stringify(s)} (heap ${(s.heapMB - start.heapMB).toFixed(2)} MB over start)`,
      );
    }
  }
  const sorted = [...navMs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  log(
    `t21 nav latency min/median/max: ${(sorted[0] ?? 0).toFixed(0)} / ${median.toFixed(0)} / ${(sorted.at(-1) ?? 0).toFixed(0)} ms`,
  );

  for (const at of new Set([10, CYCLES])) {
    const end = checked.get(at);
    if (!end) throw new Error(`no sample at cycle ${at}`);
    expect(end.nodes, `DOM nodes at ${at}`).toBeLessThanOrEqual(start.nodes * 1.03);
    expect(end.listeners, `event listeners at ${at}`).toBeLessThanOrEqual(start.listeners * 1.05);
    expect(end.canvases, `canvases in the heap, detached included, at ${at}`).toBe(start.canvases);
    expect(
      end.heapMB - start.heapMB,
      `JS heap over the settled start at ${at}, MB`,
    ).toBeLessThanOrEqual(HEAP_CEILING_MB[at] ?? 0);
    expect(end.geometries, `renderer geometries at ${at}`).toBe(start.geometries);
    expect(end.textures, `renderer textures at ${at}`).toBe(start.textures);
  }
  if (LONG) {
    const points = [...checked]
      .filter(([i]) => i >= SLOPE_FROM)
      .map(([i, s]) => [i, s.heapMB] as const);
    const perCycle = slope(points);
    log(`t21 heap slope, cycles ${SLOPE_FROM}-${CYCLES}: ${perCycle.toFixed(4)} MB/cycle`);
    expect(perCycle, 'heap slope, MB per cycle').toBeLessThan(MAX_SLOPE_MB);
  }
  expect(await page.evaluate(() => window.__t21ContextLost)).toBe(0);
  expect(warnings).toEqual([]);
});
