import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { startPeak } from './mockSim';

// Task 22.10 measured whether leaving /live (bell "View all events", tray row icon, KPI "Needs attention" rows,
// toast "Open") hangs because every one of those navigations ran inside React.startTransition (react-router 7's
// BrowserRouter) while the busy R3F render loop and the liveStore's 4 Hz flushes starved that low-priority render.
// Confirmed (docs/progress/t22-10.md): median 7-22 s, vs 7-300 ms with `useTransitions={false}`. Task 22.11 applied
// the fix (`src/app/App.tsx`); this file is now its regression/verification harness, not a one-off experiment.
//
// Opt-in only (~40 min for the default 3 conditions x 4 entry points x 5 reps): skipped unless NAV_LATENCY=1.
//   NAV_LATENCY=1 pnpm exec playwright test e2e/t22-10-nav-latency.spec.ts
// REPS defaults to 5; CONDITIONS defaults to all three. For a quick post-change check (22.11 item 5):
//   NAV_LATENCY=1 T22_10_REPS=3 T22_10_CONDITIONS=settled,warmup pnpm exec playwright test e2e/t22-10-nav-latency.spec.ts
// A/B against the pre-22.11 behaviour (if ever needed again): temporarily restore `<BrowserRouter>` with no
// `useTransitions` prop in src/app/App.tsx, then tag the run so the log/console lines don't mix:
//   NAV_LATENCY=1 T22_10_VARIANT=withtransitions pnpm exec playwright test e2e/t22-10-nav-latency.spec.ts

declare global {
  interface Window {
    // already declared `unknown` in e2e/t21-nav-leak.spec.ts; narrowed with a cast at the one call site instead of
    // redeclaring it here (TS merges `declare global` across the whole e2e program and rejects a conflicting type).
    __soakProbe?: unknown;
    __qualityFpsOverride?: number | null;
    __nav?: { entries: { start: number; dur: number }[]; frames: number };
  }
}

const VARIANT = process.env.T22_10_VARIANT ?? 'current';
const REPS = Number(process.env.T22_10_REPS ?? 5);
/** Cap on click -> URL change. A miss is logged, not failed: a long cap would just make a hung run slower to report. */
const URL_CAP_MS = 15_000;
/** Cap on click -> destination heading visible, matching the 22.9 "Open on a toast" investigation's own waits. */
const HEADING_CAP_MS = 30_000;
/** Cap on a best-effort page.evaluate after a measurement, so a still-stalled main thread cannot hang the harness. */
const EVALUATE_RACE_MS = 3_000;

type Condition = 'settled' | 'warmup' | 'burst';
const ALL_CONDITIONS: readonly Condition[] = ['settled', 'warmup', 'burst'];
const CONDITIONS: readonly Condition[] = process.env.T22_10_CONDITIONS
  ? process.env.T22_10_CONDITIONS.split(',').map((c) => {
      const trimmed = c.trim();
      if (!ALL_CONDITIONS.includes(trimmed as Condition)) {
        throw new Error(`T22_10_CONDITIONS: unknown condition "${trimmed}"`);
      }
      return trimmed as Condition;
    })
  : ALL_CONDITIONS;

function log(line: string) {
  console.log(line);
  const dir = test.info().project.outputDir;
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, `t22-10-nav-latency-${VARIANT}.log`), `${line}\n`);
}

/** Least-squares-free summary: sorted min/median/p95/max, ms. `null` entries (capped) are reported separately. */
function summarize(values: readonly (number | null)[]) {
  const ok = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  const capped = values.length - ok.length;
  const n = values.length;
  if (ok.length === 0) return { min: null, median: null, p95: null, max: null, capped, n };
  const mid = Math.floor(ok.length / 2);
  const a = ok[mid - 1] ?? ok[0] ?? 0;
  const b = ok[mid] ?? a;
  const median = ok.length % 2 ? b : (a + b) / 2;
  const p95 = ok[Math.min(ok.length - 1, Math.ceil(ok.length * 0.95) - 1)] ?? b;
  return { min: ok[0] ?? 0, median, p95, max: ok.at(-1) ?? 0, capped, n };
}

/** Node-side poll of a synchronous, JS-execution-free check (page.url() needs no page JS; see 22.9 investigation 1). */
async function timeUntil(check: () => boolean, capMs: number, pollMs = 25): Promise<number | null> {
  const t0 = Date.now();
  for (;;) {
    if (check()) return Date.now() - t0;
    if (Date.now() - t0 >= capMs) return null;
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

/** Playwright's own waitFor is timeout-bounded even if the page's main thread never responds (confirmed, 22.9). */
async function timeUntilVisible(locator: Locator, capMs: number): Promise<number | null> {
  const t0 = Date.now();
  try {
    await locator.waitFor({ state: 'visible', timeout: capMs });
    return Date.now() - t0;
  } catch {
    return null;
  }
}

async function raceEvaluate<T>(
  page: Page,
  fn: () => T,
  capMs = EVALUATE_RACE_MS,
): Promise<T | 'unresponsive'> {
  return Promise.race([
    page.evaluate(fn),
    new Promise<'unresponsive'>((resolve) => setTimeout(() => resolve('unresponsive'), capMs)),
  ]);
}

async function clientPush(page: Page, path: string) {
  await page.evaluate((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

/** Remount /live client-side (no reload: keeps the simulator and its backfilled alerts), recovering with a real reload if the page is unresponsive. */
async function ensureFreshLive(page: Page) {
  try {
    if (/\/live(\?|$)/.test(page.url())) await clientPush(page, '/trucks');
    await clientPush(page, '/live');
    await expect(page.getByTestId('tray-bay-B01')).toBeVisible({ timeout: 20_000 });
  } catch {
    log(`t22-10 recovery: client-side remount did not land, reloading`);
    await page.goto('/live');
    await expect(page.getByTestId('tray-bay-B01')).toBeVisible({ timeout: 60_000 });
  }
}

/**
 * src/scene/tierGovernor.ts `frame()`: with no fps override, any frame gap over `maxFrameGapMs` (800 ms) is read as
 * "the browser paused drawing," not a slow frame, and resets the warmup settle timer. Confirmed directly in this
 * sandbox (first smoke run): real SwiftShader fps under this test's load is near or under 1 fps (observed 5-19
 * frames over a 12-25 s window), so almost every frame gap exceeds 800 ms and 'monitoring' is never reached — 90 s,
 * 172 consecutive 'warmup' reads, tier already 'low'. `window.__qualityFpsOverride` (e2e-only, QUALITY_DEBUG) is the
 * established workaround for exactly this (`e2e/auto-quality.spec.ts`'s own comment: "a software rasteriser cannot
 * run fast or slow on demand"): a non-null override skips the gap check entirely, so the governor can still progress
 * through its time-based warmup window. Used only for the 'settled' and 'burst' conditions (see `measureOne`); see
 * docs/progress/t22-10.md "Methodology" for what this does and does not stand in for (not a real-GPU measurement).
 */
async function setFpsOverride(page: Page, fps: number | null) {
  await page.evaluate((v) => {
    window.__qualityFpsOverride = v;
  }, fps);
}

/** Soft wait, not a hard assertion: returns whether 'monitoring' was reached: the caller proceeds either way, with
 * the real state recorded per rep by `stateAtClick`. */
async function waitSettled(page: Page, capMs = 20_000): Promise<boolean> {
  const badge = page.getByTestId('quality-badge');
  const t0 = Date.now();
  for (;;) {
    if ((await badge.getAttribute('data-state').catch(() => null)) === 'monitoring') return true;
    if (Date.now() - t0 >= capMs) return false;
    await new Promise((r) => setTimeout(r, 500));
  }
}

let currentSpeed = 1;
async function setSpeed(page: Page, speed: 1 | 10 | 60) {
  if (currentSpeed === speed) return;
  await page.evaluate(
    (s) => (window.__soakProbe as { setSpeed(speed: number): void } | undefined)?.setSpeed(s),
    speed,
  );
  currentSpeed = speed;
}

interface EntryPoint {
  id: string;
  label: string;
  /** Speed to hold during each condition (burst always 60; the others are the minimum needed to get the signal the
   * entry point depends on within a bounded wait — see docs/progress/t22-10.md "Methodology"). */
  speed: Record<Condition, 1 | 10 | 60>;
  /** Makes the trigger element ready and returns it, WITHOUT clicking it. Timed from the click, not from this. */
  ready: (page: Page) => Promise<Locator>;
  urlPattern: RegExp;
  heading: (page: Page) => Locator;
}

const ENTRY_POINTS: readonly EntryPoint[] = [
  {
    id: 'bell',
    label: 'bell "View all events"',
    speed: { settled: 1, warmup: 1, burst: 60 },
    async ready(page) {
      await page.getByTestId('alert-bell').click();
      const item = page.getByText('View all events');
      await item.waitFor({ state: 'visible', timeout: 10_000 });
      return item;
    },
    urlPattern: /\/events$/,
    heading: (page) => page.getByRole('heading', { level: 1 }),
  },
  {
    id: 'tray',
    label: 'tray row icon ("Open in Events")',
    speed: { settled: 1, warmup: 1, burst: 60 },
    async ready(page) {
      await page.locator('#tray-tab-alerts').click();
      const link = page.locator('[data-testid^="tray-alert-"][data-testid$="-open"]').first();
      await link.waitFor({ state: 'visible', timeout: 15_000 });
      return link;
    },
    urlPattern: /\/events\/[0-9A-Z]{26}/,
    heading: (page) => page.getByTestId('event-detail'),
  },
  {
    id: 'kpi',
    label: 'KPI "Needs attention" row',
    speed: { settled: 1, warmup: 1, burst: 60 },
    async ready(page) {
      await page.getByTestId('kpi-alerts').hover();
      await page.getByTestId('kpi-alerts').click();
      const row = page.getByTestId('kpidetail-groups').locator('[data-group]').first();
      await row.waitFor({ state: 'visible', timeout: 15_000 });
      return row;
    },
    urlPattern: /\/events\?group=/,
    heading: (page) => page.getByRole('heading', { level: 1 }),
  },
  {
    id: 'toast',
    label: 'toast "Open"',
    // bell/tray/kpi read already-backfilled alerts; a toast needs a *new* live event, so settled/warmup hold a
    // minimum speed just so one arrives inside the wait at all (see docs/progress/t22-10.md "Methodology").
    speed: { settled: 10, warmup: 60, burst: 60 },
    async ready(page) {
      const toast = page.getByTestId('live-toast').first();
      await toast.waitFor({ state: 'visible', timeout: 60_000 });
      const btn = toast.getByRole('button', { name: 'Open' });
      await btn.waitFor({ state: 'visible', timeout: 5_000 });
      return btn;
    },
    urlPattern: /\/events\/[0-9A-Z]{26}/,
    heading: (page) => page.getByTestId('event-detail'),
  },
];

interface Row {
  entry: string;
  condition: Condition;
  rep: number;
  stateAtClick: string;
  settled: boolean | 'n/a';
  urlMs: number | null;
  headingMs: number | null;
  longTasks: number | 'unresponsive';
  longTaskMs: number | 'unresponsive';
  frames: number | 'unresponsive';
  error?: string;
}

async function measureOne(
  page: Page,
  entry: EntryPoint,
  condition: Condition,
  rep: number,
): Promise<Row> {
  await ensureFreshLive(page);
  await setFpsOverride(page, condition === 'warmup' ? null : 45);
  await setSpeed(page, entry.speed[condition]);
  const settled = condition === 'warmup' ? 'n/a' : await waitSettled(page);
  if (settled === false)
    log(
      `t22-10 [${VARIANT}] ${entry.id}/${condition}/${rep}: did not settle within cap, proceeding in whatever state it is in`,
    );
  const target = await entry.ready(page);
  const stateAtClick = String(
    await raceEvaluate(page, () =>
      document.querySelector('[data-testid="quality-badge"]')?.getAttribute('data-state'),
    ),
  );
  const before = await raceEvaluate(page, () => ({
    lt: window.__nav?.entries.length ?? 0,
    ltMs: window.__nav?.entries.reduce((s, e) => s + e.dur, 0) ?? 0,
    frames: window.__nav?.frames ?? 0,
  }));
  const t0 = Date.now();
  await target.click();
  const urlMs = await timeUntil(() => entry.urlPattern.test(page.url()), URL_CAP_MS);
  const headingMs = await timeUntilVisible(entry.heading(page), HEADING_CAP_MS - (urlMs ?? 0));
  const totalMs = Date.now() - t0;
  const after = await raceEvaluate(page, () => ({
    lt: window.__nav?.entries.length ?? 0,
    ltMs: window.__nav?.entries.reduce((s, e) => s + e.dur, 0) ?? 0,
    frames: window.__nav?.frames ?? 0,
  }));
  const row: Row = {
    entry: entry.id,
    condition,
    rep,
    stateAtClick,
    settled,
    urlMs,
    headingMs,
    longTasks:
      before === 'unresponsive' || after === 'unresponsive' ? 'unresponsive' : after.lt - before.lt,
    longTaskMs:
      before === 'unresponsive' || after === 'unresponsive'
        ? 'unresponsive'
        : Math.round(after.ltMs - before.ltMs),
    frames:
      before === 'unresponsive' || after === 'unresponsive'
        ? 'unresponsive'
        : after.frames - before.frames,
  };
  log(
    `t22-10 [${VARIANT}] ${entry.id}/${condition}/${rep}: state@click=${stateAtClick} url=${urlMs ?? `>${URL_CAP_MS}`}ms heading=${headingMs ?? `>${HEADING_CAP_MS}`}ms longtasks=${row.longTasks}(${row.longTaskMs}ms) frames=${row.frames} totalMs=${totalMs}`,
  );
  return row;
}

test(`nav latency matrix [${VARIANT}]`, async ({ page }) => {
  test.skip(
    process.env.NAV_LATENCY !== '1',
    'opt-in only (NAV_LATENCY=1): a ~40 min measurement harness, not part of the default suite',
  );
  test.setTimeout(100 * 60 * 1000);
  // cumulative for the whole document lifetime: survives every client-side remount below, reset only by a real reload.
  await page.addInitScript(() => {
    const nav: { entries: { start: number; dur: number }[]; frames: number } = {
      entries: [],
      frames: 0,
    };
    window.__nav = nav;
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        nav.entries.push({ start: e.startTime, dur: e.duration });
      }
    });
    obs.observe({ entryTypes: ['longtask'] });
    const realRaf = window.requestAnimationFrame.bind(window);
    const tick = () => {
      nav.frames++;
      realRaf(tick);
    };
    realRaf(tick);
  });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/live');
  await expect(page.getByTestId('tray-bay-B01')).toBeVisible({ timeout: 60_000 });

  let peakLanded = true;
  try {
    await startPeak(page, { keepPanel: false });
  } catch (e) {
    peakLanded = false;
    log(
      `t22-10 startPeak() did not land (closest working condition: default scenario, not peak): ${e}`,
    );
  }
  log(`t22-10 [${VARIANT}] peakLanded=${peakLanded} reps=${REPS}`);

  const rows: Row[] = [];
  for (const condition of CONDITIONS) {
    for (const entry of ENTRY_POINTS) {
      for (let rep = 1; rep <= REPS; rep++) {
        try {
          rows.push(await measureOne(page, entry, condition, rep));
        } catch (e) {
          log(`t22-10 [${VARIANT}] ${entry.id}/${condition}/${rep}: FAILED, skipping: ${e}`);
          rows.push({
            entry: entry.id,
            condition,
            rep,
            stateAtClick: 'n/a',
            settled: 'n/a',
            urlMs: null,
            headingMs: null,
            longTasks: 'unresponsive',
            longTaskMs: 'unresponsive',
            frames: 'unresponsive',
            error: String(e).slice(0, 300),
          });
          // a rep can fail mid-navigation (e.g. the destination never commits); recover with a hard reload so the
          // next rep does not inherit a half-navigated page.
          await page.goto('/live').catch(() => undefined);
        }
      }
    }
  }

  log(`t22-10 [${VARIANT}] ---- summary (ms) ----`);
  for (const condition of CONDITIONS) {
    for (const entry of ENTRY_POINTS) {
      const cell = rows.filter((r) => r.entry === entry.id && r.condition === condition);
      const url = summarize(cell.map((r) => r.urlMs));
      const heading = summarize(cell.map((r) => r.headingMs));
      log(
        `t22-10 [${VARIANT}] ${entry.id}/${condition}: ` +
          `url min/median/p95/max=${url.min}/${url.median}/${url.p95}/${url.max} capped=${url.capped}/${url.n} | ` +
          `heading min/median/p95/max=${heading.min}/${heading.median}/${heading.p95}/${heading.max} capped=${heading.capped}/${heading.n} | ` +
          `states@click=${cell.map((r) => r.stateAtClick).join(',')}`,
      );
    }
  }
  appendFileSync(
    join(test.info().project.outputDir, `t22-10-nav-latency-${VARIANT}.json`),
    JSON.stringify(rows, null, 2),
  );

  // Not a gate: a harness that produced zero usable samples is broken, not merely slow.
  expect(rows.length, 'rows recorded').toBe(CONDITIONS.length * ENTRY_POINTS.length * REPS);
});
