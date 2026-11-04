import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { settle, startPeak } from './mockSim';

// Task 20.9 screenshots of the Performance tab, docs/screens/t20-*. Opt-in (PowerShell):
//   $env:T20_SHOTS='1'; pnpm exec playwright test e2e/t20-shots.spec.ts
// Every test restarts the simulator on the fixed evening-peak day (2026-10-24 19:20 Dhaka, seed 1) from a placeholder tab
// (no analytics query yet), then opens Performance by a client-side click, so every query runs on the peak data.
// 1. week (data) at 1366x768, 1920x1080, 2560x1440, EN and BN, light and dark (full page).
// 2. day and shift (sparse in the mock) at 1366 and 1920.
// 3. loading, error with retry, empty: forced by a page-level fetch override of the two analytics endpoints (the MSW
//    worker is not exposed to the page, and src/data/msw is a shared file).
// 4. one tooltip per chart (W2, W4), EN and BN; the hidden data table of each chart; request counts per range.

const SCREENS = path.resolve(import.meta.dirname, '..', 'docs', 'screens');
const NOTES = path.resolve(import.meta.dirname, '..', 'test-results', 't20-shots-notes.json');
test.skip(process.env.T20_SHOTS !== '1', 'screenshot pass, opt-in');
test.describe.configure({ timeout: 900_000 });

type Lang = 'en' | 'bn';
type Theme = 'light' | 'dark';
type Range = 'shift' | 'day' | 'week';
type Mode = 'error' | 'hang' | 'empty' | null;
type Override = { mode: Mode; log: { url: string; at: number }[] };

const LATIN_DIGIT = /[0-9]/;
const notes: Record<string, unknown> = {};

/** Wraps window.fetch for /analytics/bay-performance and /analytics/throughput: logs every call; can hang, fail or empty them. */
function installOverride() {
  const w = window as unknown as { __t20: Override; fetch: typeof fetch };
  const state: Override = { mode: null, log: [] };
  w.__t20 = state;
  const orig = window.fetch.bind(window);
  w.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const m = /\/analytics\/(bay-performance|throughput)\b/.exec(url);
    if (!m) return orig(input, init);
    state.log.push({ url, at: Date.now() });
    if (state.mode === 'hang') return new Promise<Response>(() => {});
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    if (state.mode === 'error')
      return json({ error: { code: 'INTERNAL', message: 'forced by t20-shots' } }, 500);
    if (state.mode !== 'empty') return orig(input, init);
    const body = (await (await orig(input, init)).json()) as Record<string, unknown>;
    if (m[1] === 'throughput') return json({ ...body, series: [] });
    const rows = (body.rows as Record<string, unknown>[]).map((r) => ({
      ...r,
      visits: 0,
      included: 0,
      cartonsOut: 0,
      cartonsIn: 0,
      cartonsPerLoadingHour: null,
      minPer100Cartons: null,
      avgCrew: null,
      cartonsPerCrewHour: null,
      mean: {
        occupancyMin: null,
        waitForDockMin: null,
        preOpMin: null,
        activeMin: null,
        postOpMin: null,
      },
      detentions: 0,
      index: null,
      confidence: 'NONE',
    }));
    const site = {
      visits: 0,
      medianOccupancyMin: null,
      medianPreOpMin: null,
      medianPostOpMin: null,
    };
    return json({ ...body, site, cohorts: [], rows });
  };
}

const setMode = (page: Page, mode: Mode) =>
  page.evaluate((m) => {
    (window as unknown as { __t20: Override }).__t20.mode = m;
  }, mode);

const requestLog = (page: Page) =>
  page.evaluate(() => (window as unknown as { __t20: Override }).__t20.log);

/** Restart the simulator on the peak day, then open Performance on `range` with `mode` already set. */
async function openPerformance(
  page: Page,
  { w, h, range, mode = null }: { w: number; h: number; range: Range; mode?: Mode },
) {
  await page.addInitScript(installOverride);
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`/analytics/throughput?range=${range}`);
  const perfTab = page.locator('a[data-tab="performance"]');
  await expect(perfTab).toBeVisible({ timeout: 60_000 });
  await startPeak(page);
  await setMode(page, mode);
  await perfTab.click();
  await expect(page.getByTestId('perf-tab')).toBeVisible({ timeout: 60_000 });
}

/** Wait until the widgets left their loading state (charts drawn, fonts in). */
async function ready(page: Page) {
  const tab = page.getByTestId('perf-tab');
  await expect(tab.getByTestId('widget-loading')).toHaveCount(0, { timeout: 60_000 });
  // every chart on screen has drawn its canvas (the ECharts chunk is lazy)
  await expect
    .poll(
      async () =>
        (await tab.getByTestId('chart-canvas').count()) -
        (await tab.locator('[data-testid="chart-canvas"] canvas').count()),
      { timeout: 30_000 },
    )
    .toBeLessThanOrEqual(0);
  await settle(page, 1200);
}

async function setLang(page: Page, lang: Lang) {
  await page.getByRole('button', { name: lang === 'bn' ? 'বাং' : 'EN', exact: true }).click();
  await expect(page.locator('[data-testid="range-selector"] [data-range="day"]')).toHaveText(
    lang === 'bn' ? 'আজ' : 'Today',
  );
  await settle(page, 800);
}

async function setTheme(page: Page, theme: Theme) {
  const isDark = () => page.evaluate(() => document.documentElement.classList.contains('dark'));
  if ((await isDark()) !== (theme === 'dark')) await page.getByTestId('theme-toggle').click();
  await expect.poll(isDark).toBe(theme === 'dark');
  await settle(page, 800);
}

/**
 * The whole Performance tab. The shell is `h-screen` and scrolls inside its main element, so `fullPage` only sees the
 * viewport: the viewport is made as tall as the content for the shot (the width, and so the layout, is unchanged).
 */
async function shot(page: Page, name: string) {
  const vp = page.viewportSize();
  if (!vp) throw new Error('no viewport');
  const height = await page.evaluate(() => {
    let el: HTMLElement | null = document.querySelector('[data-testid="analytics-page"]');
    while (
      el &&
      !(el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflowY !== 'visible')
    )
      el = el.parentElement;
    return el ? Math.ceil(el.getBoundingClientRect().top + el.scrollHeight + 24) : innerHeight;
  });
  if (height > vp.height) {
    await page.setViewportSize({ width: vp.width, height });
    await settle(page, 800);
  }
  await page.screenshot({ path: path.join(SCREENS, `t20-${name}.png`), animations: 'disabled' });
  if (height > vp.height) {
    await page.setViewportSize(vp);
    await settle(page, 400);
  }
}

/** Horizontal overflow of the page and of every widget card (px). */
async function overflow(page: Page) {
  return page.evaluate(() => {
    const out: Record<string, number> = {
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="perf-w"]')))
      out[el.dataset.testid ?? '?'] = el.scrollWidth - el.clientWidth;
    return out;
  });
}

/** Text of each chart's hidden data table. */
async function dataTables(page: Page) {
  return page
    .locator('[data-testid="perf-tab"] [data-testid="chart-data-table"]')
    .evaluateAll((els) => els.map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()));
}

// merged after every test: a failed test restarts the worker, which would lose notes kept until afterAll
test.afterEach(() => {
  const old = existsSync(NOTES)
    ? (JSON.parse(readFileSync(NOTES, 'utf8')) as Record<string, unknown>)
    : {};
  mkdirSync(path.dirname(NOTES), { recursive: true });
  writeFileSync(NOTES, JSON.stringify({ ...old, ...notes }, null, 2));
});

const VIEWPORTS = [
  { w: 1366, h: 768 },
  { w: 1920, h: 1080 },
  { w: 2560, h: 1440 },
] as const;

for (const vp of VIEWPORTS) {
  for (const theme of ['light', 'dark'] as const) {
    test(`week ${vp.w}x${vp.h} ${theme}`, async ({ page }) => {
      await openPerformance(page, { ...vp, range: 'week' });
      await setTheme(page, theme);
      for (const lang of ['en', 'bn'] as const) {
        await setLang(page, lang);
        await ready(page);
        await shot(page, `week-${vp.w}-${lang}-${theme}`);
        notes[`overflow week ${vp.w} ${lang} ${theme}`] = await overflow(page);
        const tables = await dataTables(page);
        notes[`tables week ${vp.w} ${lang} ${theme}`] = tables.length;
        if (lang === 'bn') {
          expect(tables.length).toBe(2);
          for (const tx of tables)
            expect(tx, 'Bangla data table has Latin digits').not.toMatch(LATIN_DIGIT);
        }
      }
      // one bay-performance and two throughput requests for the week, however many widgets read them
      const log = await requestLog(page);
      notes[`requests week ${vp.w} ${theme}`] = log.map((l) => l.url.replace(/^.*\/analytics/, ''));
      // finished trucks per bay on the week (W3 "Trucks" column, EN digits)
      await setLang(page, 'en');
      notes[`week trucks per bay ${vp.w} ${theme}`] = await page
        .locator('[data-testid^="w3-row-B"] td[data-col="trucks"]')
        .allTextContents();
      await setLang(page, 'en');
    });
  }
}

for (const range of ['day', 'shift'] as const) {
  for (const vp of VIEWPORTS.slice(0, 2)) {
    test(`${range} ${vp.w}x${vp.h}`, async ({ page }) => {
      await openPerformance(page, { ...vp, range });
      await ready(page);
      await shot(page, `${range}-${vp.w}-en-light`);
      notes[`overflow ${range} ${vp.w}`] = await overflow(page);
      notes[`w1 show-week ${range}`] = await page.getByTestId('w1-show-week').count();
      notes[`status ${range}`] = await page
        .locator('[data-testid^="perf-w"]')
        .evaluateAll((els) =>
          els.map((e) => [
            e.getAttribute('data-testid'),
            e.querySelector('[data-testid^="widget-"]')?.getAttribute('data-testid') ?? 'ready',
          ]),
        );
      await setTheme(page, 'dark');
      await setLang(page, 'bn');
      await ready(page);
      await shot(page, `${range}-${vp.w}-bn-dark`);
      await setLang(page, 'en');
      await setTheme(page, 'light');
      const log = await requestLog(page);
      notes[`requests ${range} ${vp.w}`] = log.map((l) => l.url.replace(/^.*\/analytics/, ''));
    });
  }
}

for (const mode of ['hang', 'error', 'empty'] as const) {
  test(`state ${mode}`, async ({ page }) => {
    await openPerformance(page, { w: 1366, h: 768, range: 'week', mode });
    if (mode === 'error')
      await expect(page.getByRole('button', { name: 'Retry' }).first()).toBeVisible({
        timeout: 30_000,
      });
    if (mode === 'empty')
      await expect(page.getByText('No finished trucks in this range').first()).toBeVisible({
        timeout: 30_000,
      });
    await settle(page, 1000);
    const name = mode === 'hang' ? 'loading' : mode;
    await shot(page, `state-${name}-1366-en-light`);
    await setLang(page, 'bn');
    await shot(page, `state-${name}-1366-bn-light`);
    await setLang(page, 'en');
    if (mode === 'error') {
      // retry recovers once the endpoint answers again
      await setMode(page, null);
      // each widget's Retry refetches its own query: W4 (throughput, twice), then W1 (bay-performance, shared by W1-W3, W5)
      await page.getByTestId('perf-w4').getByRole('button', { name: 'Retry' }).click();
      await expect(page.getByTestId('trend-chart')).toBeVisible({ timeout: 30_000 });
      await page.getByTestId('perf-w1').getByRole('button', { name: 'Retry' }).click();
      await expect(page.getByTestId('w1-rows')).toBeVisible({ timeout: 30_000 });
      // the shared query recovers every widget that reads it
      await expect(page.getByTestId('detention-strip')).toBeVisible();
      await expect(page.getByTestId('w3-table')).toBeVisible();
      notes['error retry recovers W4, then W1-W3 and W5 together'] = true;
    }
  });
}

test('chart tooltips', async ({ page }) => {
  await openPerformance(page, { w: 1920, h: 1080, range: 'week' });
  await ready(page);
  for (const lang of ['en', 'bn'] as const) {
    await setLang(page, lang);
    await ready(page);
    for (const [card, chart] of [
      ['perf-w4', 'trend-chart'],
      ['perf-w2', 'w2-chart'],
    ] as const) {
      const canvas = page.getByTestId(chart).getByTestId('chart-canvas');
      await canvas.scrollIntoViewIfNeeded();
      const box = await canvas.boundingBox();
      if (!box) throw new Error(`${chart} has no box`);
      // W4: a point in the middle of the week; W2: the third bay's bar
      const at =
        chart === 'trend-chart'
          ? { x: box.x + box.width * 0.55, y: box.y + box.height * 0.5 }
          : { x: box.x + box.width * 0.4, y: box.y + 28 + (box.height - 64) * (2.5 / 7) };
      await page.mouse.move(at.x, at.y);
      await page.waitForTimeout(600);
      const tip = await page.getByTestId(card).evaluate((el) => {
        const t = Array.from(el.querySelectorAll<HTMLElement>('div')).find(
          (d) =>
            d.style.position === 'absolute' && d.style.zIndex !== '' && d.style.display !== 'none',
        );
        return t?.innerText ?? null;
      });
      notes[`tooltip ${chart} ${lang}`] = tip;
      if (lang === 'bn' && tip)
        expect(tip, `${chart} tooltip has Latin digits`).not.toMatch(LATIN_DIGIT);
      await page.getByTestId(card).screenshot({
        path: path.join(
          SCREENS,
          `t20-tooltip-${chart === 'trend-chart' ? 'w4' : 'w2'}-${lang}.png`,
        ),
        animations: 'disabled',
      });
      await page.mouse.move(0, 0);
    }
  }
});
