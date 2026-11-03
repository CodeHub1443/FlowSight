/* global document -- used inside page.evaluate callbacks (browser context) */
// Report of a soak run: summary.md and chart.png beside samples.csv. Runs at the end of `pnpm soak`, and on its own
// over a finished or interrupted run:   node scripts/soak/report.mjs docs/soak/<run>
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { CRITERIA, evaluate, median, parseCsv, series, slope } from './stats.mjs';

const PANELS = [
  { key: 'heapAfterGcMB', fallback: 'heapMB', title: 'JS heap after GC', unit: 'MB' },
  { key: 'nodesAfterGc', fallback: 'domNodes', title: 'DOM nodes', unit: '' },
  { key: 'geometries', title: 'WebGL geometries', unit: '' },
  { key: 'textures', title: 'WebGL textures', unit: '' },
  { key: 'medianFps', title: 'Frame rate (median)', unit: 'fps' },
  { key: 'p95FrameMs', title: 'Frame time (p95)', unit: 'ms' },
  { key: 'gpuMs', title: 'GPU time per frame', unit: 'ms' },
  { key: 'cpuMs', title: 'Script time per frame', unit: 'ms' },
];

const INK = {
  surface: '#fcfcfb',
  text: '#0b0b0b',
  muted: '#52514e',
  grid: '#e6e5e0',
  line: '#2a78d6',
};
const W = 460;
const H = 210;
const PLOT = { left: 48, right: 20, top: 34, bottom: 26 };

const fmt = (v, digits = 1) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? 'n/a'
    : Math.abs(v) >= 100
      ? String(Math.round(v))
      : v.toFixed(digits);

function niceMax(v) {
  if (!(v > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 3, 4, 5, 7.5, 10]) if (v <= m * mag) return m * mag;
  return 10 * mag;
}

/** One small multiple. The y-axis starts at zero, so "flat" and "a 5 % drop" look as big as they are. */
function panel(rows, spec, markers, endH) {
  const pts =
    series(rows, spec.key).length >= 3
      ? series(rows, spec.key)
      : series(rows, spec.fallback ?? spec.key);
  const iw = W - PLOT.left - PLOT.right;
  const ih = H - PLOT.top - PLOT.bottom;
  const top = niceMax(Math.max(...pts.map(([, y]) => y), 0));
  const x = (h) => PLOT.left + (endH > 0 ? (h / endH) * iw : 0);
  const y = (v) => PLOT.top + ih - (v / top) * ih;
  const path = pts
    .map(([h, v], i) => `${i ? 'L' : 'M'}${x(h).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(' ');
  const grid = [0, 0.5, 1]
    .map((k) => {
      const yy = y(top * k);
      return `<line x1="${PLOT.left}" x2="${W - PLOT.right}" y1="${yy}" y2="${yy}" stroke="${INK.grid}"/>
        <text x="${PLOT.left - 6}" y="${yy + 4}" text-anchor="end" fill="${INK.muted}" font-size="11">${fmt(top * k, top < 10 ? 1 : 0)}</text>`;
    })
    .join('');
  const marks = markers
    .map(
      (
        m,
      ) => `<line x1="${x(m.h)}" x2="${x(m.h)}" y1="${PLOT.top}" y2="${PLOT.top + ih}" stroke="${INK.muted}"/>
      <text x="${x(m.h) + 3}" y="${PLOT.top + ih - 4}" fill="${INK.muted}" font-size="10">${m.label}</text>`,
    )
    .join('');
  const ticks = Array.from({ length: 5 }, (_, i) => (endH * i) / 4)
    .map(
      (h) =>
        `<text x="${x(h)}" y="${H - 8}" text-anchor="middle" fill="${INK.muted}" font-size="11">${fmt(h, endH < 3 ? 2 : 1)} h</text>`,
    )
    .join('');
  const last = pts.at(-1);
  const end = last
    ? `<circle cx="${x(last[0])}" cy="${y(last[1])}" r="4" fill="${INK.line}" stroke="${INK.surface}" stroke-width="2"/>`
    : '';
  const firstV = pts[0]?.[1];
  const lastV = last?.[1];
  return `<g>
    <text x="${PLOT.left}" y="16" font-size="13" font-weight="600" fill="${INK.text}">${spec.title}${spec.unit ? ` (${spec.unit})` : ''}</text>
    <text x="${W - PLOT.right}" y="16" text-anchor="end" font-size="11" fill="${INK.muted}">first ${fmt(firstV)} · last ${fmt(lastV)}</text>
    ${grid}${marks}${ticks}
    <path d="${path}" fill="none" stroke="${INK.line}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${end}
  </g>`;
}

export function chartHtml(rows, meta) {
  const endH = rows.at(-1)?.hours ?? 1;
  const warmupH = meta.warmupMinutes / 60;
  const markers = [{ h: warmupH, label: 'warm-up ends' }];
  let at = 0;
  for (const p of meta.phases) {
    if (p.speed !== 1 && at > 0) markers.push({ h: at / 60, label: `${p.speed}x` });
    at += p.minutes;
  }
  const cols = 4;
  const panels = PANELS.map(
    (spec, i) =>
      `<g transform="translate(${(i % cols) * W} ${Math.floor(i / cols) * H})">${panel(rows, spec, markers, endH)}</g>`,
  ).join('');
  const width = cols * W;
  const height = Math.ceil(PANELS.length / cols) * H;
  return `<!doctype html><html><body style="margin:0;background:${INK.surface}">
    <svg id="chart" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" font-family="Inter, 'Segoe UI', Arial, sans-serif">
    <rect width="${width}" height="${height}" fill="${INK.surface}"/>${panels}</svg></body></html>`;
}

async function renderChart(html, path) {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1860, height: 440 },
    deviceScaleFactor: 1,
  });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#chart').screenshot({ path });
  await browser.close();
}

const SIZE_KEYS = [
  ['liveBays', 'liveStore.bays', 'site config: 7 bays'],
  ['liveBayRxAt', 'liveStore.bayRxAt', 'site config: 7 bays'],
  ['liveActors', 'liveStore.actors', 'site config: 7 bays (each frame replaces the last)'],
  ['liveVisits', 'liveStore.visits', 'cap 60, oldest arrival out'],
  ['alertEvents', 'alertStore.events', 'cap 500, oldest closed first'],
  ['alertLifecycleAt', 'alertStore.lifecycleAt', 'only events held'],
  ['alertPending', 'alertStore.pending', 'cap 200 events, oldest out; 8 per event'],
  ['alertUnread', 'alertStore.unreadIds', 'only events held'],
  ['simEvents', 'simulator history: events', '8 days, open ones stay (mock only)'],
  ['simVisits', 'simulator history: visits', '8 days, unfinished stay (mock only)'],
  ['simBelt', 'simulator history: belt intervals', '8 days (mock only)'],
  ['simHourCounts', 'simulator history: hourly counts', '8 days (mock only)'],
  ['simSkuHour', 'simulator history: SKU tallies', '8 days (mock only)'],
  ['simCurves', 'simulator history: day curves', '8 days (mock only)'],
  ['simIncidents', 'simulator history: camera incidents', '8 days, open ones stay (mock only)'],
];

export function summaryMarkdown(rows, meta, counts) {
  const warmupH = meta.warmupMinutes / 60;
  const result = evaluate(rows, { warmupH, ...counts });
  const lines = [];
  const verdict = (p) => (p === true ? 'PASS' : p === false ? 'FAIL' : 'NOT JUDGED');
  lines.push(`# Soak report: ${meta.runId}`, '');
  lines.push(`**Result: ${result.pass ? 'PASS' : 'FAIL'}**`, '');
  lines.push(
    `- Commit: ${meta.commit}${meta.dirty ? ' + uncommitted changes' : ''}`,
    `- Renderer: ${meta.renderer ?? 'unknown'}`,
    `- Viewport: ${meta.viewport}, device scale 1, ${meta.uncapped ? 'uncapped' : 'display refresh cap (vsync)'}`,
    `- Quality: ${meta.quality}, seed ${meta.seed}`,
    `- Schedule: ${meta.phases.map((p) => `${p.minutes} min at ${p.speed}x`).join(', ')}; warm-up ${meta.warmupMinutes} min`,
    `- Started ${meta.startedAt}, lasted ${fmt(rows.at(-1)?.hours ?? 0, 2)} h, ${rows.length} samples`,
    '',
    '![Soak chart](chart.png)',
    '',
    '## Pass criteria',
    '',
    '| Check | Value | Result |',
    '|---|---|---|',
  );
  for (const c of result.checks) {
    const extra =
      c.detail?.firstMax !== undefined && c.detail.firstMax !== null
        ? ` (peak ${fmt(c.detail.firstMax)} -> ${fmt(c.detail.lastMax)})`
        : c.detail?.first !== undefined
          ? ` (${fmt(c.detail.first)} -> ${fmt(c.detail.last)} fps over ${fmt(c.detail.spanH * 60, 0)} min windows)`
          : '';
    lines.push(`| ${c.label} | ${fmt(c.value, 2)} ${c.unit}${extra} | ${verdict(c.pass)} |`);
  }

  lines.push(
    '',
    '## Slopes after warm-up',
    '',
    '| Measure | Per hour | First | Last |',
    '|---|---|---|---|',
  );
  for (const [key, label] of [
    ['heapAfterGcMB', 'Heap after GC, MB'],
    ['heapMB', 'Heap as sampled, MB'],
    ['workerHeapMB', 'Simulator worker heap, MB'],
    ['nodesAfterGc', 'DOM nodes after GC'],
    ['listenersAfterGc', 'Listeners after GC'],
    ['geometries', 'Geometries'],
    ['textures', 'Textures'],
    ['programs', 'Programs'],
    ['calls', 'Draw calls per frame'],
    ['triangles', 'Triangles per frame'],
    ['gpuMs', 'GPU ms per frame'],
    ['cpuMs', 'Script ms per frame'],
    ['medianFps', 'Median fps'],
    ['p95FrameMs', 'p95 frame ms'],
  ]) {
    const pts = series(rows, key, warmupH);
    lines.push(
      `| ${label} | ${fmt(slope(pts), 2)} | ${fmt(pts[0]?.[1])} | ${fmt(pts.at(-1)?.[1])} |`,
    );
  }

  lines.push(
    '',
    '## By phase',
    '',
    '| Phase | Samples | Median fps | Median p95 ms | Median GPU ms | Heap slope MB/h |',
    '|---|---|---|---|---|---|',
  );
  for (const speed of [...new Set(rows.map((r) => r.speed))]) {
    const part = rows.filter((r) => r.speed === speed && r.hours >= warmupH);
    if (part.length === 0) continue;
    lines.push(
      `| ${speed}x | ${part.length} | ${fmt(median(part.map((r) => Number(r.medianFps))))} | ${fmt(median(part.map((r) => Number(r.p95FrameMs))))} | ${fmt(median(part.map((r) => Number(r.gpuMs))))} | ${fmt(slope(series(part, 'heapAfterGcMB')), 2)} |`,
    );
  }

  lines.push(
    '',
    '## Collections',
    '',
    '| Collection | Retention | Peak | Last |',
    '|---|---|---|---|',
  );
  for (const [key, name, rule] of SIZE_KEYS) {
    const v = series(rows, key).map(([, y]) => y);
    lines.push(
      `| ${name} | ${rule} | ${v.length ? Math.max(...v) : 'n/a'} | ${v.at(-1) ?? 'n/a'} |`,
    );
  }

  const fg = {};
  for (const r of rows) fg[r.foreground || 'unknown'] = (fg[r.foreground || 'unknown'] ?? 0) + 1;
  const stalled = rows.filter((r) => !(Number(r.frames) > 0)).length;
  const hidden = rows.filter((r) => r.visible !== 'true').length;
  const tiers = [...new Set(rows.map((r) => r.tier))].join(', ');
  lines.push(
    '',
    '## Conditions',
    '',
    `- Foreground process per sample: ${Object.entries(fg)
      .map(([k, n]) => `${k} ${n}`)
      .join(', ')}`,
    `- Samples with no frame drawn: ${stalled}; with the tab not visible: ${hidden}`,
    `- Tiers seen: ${tiers}; render size: ${[...new Set(rows.map((r) => r.buffer))].join(', ')}`,
    `- Page errors and console errors: ${counts.errors}${counts.errors ? ' (errors.log)' : ''}`,
    `- WebGL context lost: ${counts.contextLost}; non-local requests: ${counts.nonLocal}`,
    `- Simulated user: ${rows.at(-1)?.actions ?? 0} actions, ${rows.at(-1)?.actionFailures ?? 0} failed (actions.log)`,
    '',
    `Criteria: heap slope < ${CRITERIA.heapSlopeMBPerHour} MB/h after the warm-up (post-GC samples); "flat" means the last third of the run peaks no higher than the first third (DOM and listeners: within ${CRITERIA.domGrowthShare * 100} %); fps drop < ${CRITERIA.fpsDropShare * 100} % between the first and the last window.`,
    '',
  );
  return { markdown: lines.join('\n'), result };
}

export async function writeReport(dir) {
  const rows = parseCsv(readFileSync(join(dir, 'samples.csv'), 'utf8'));
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const last = rows.at(-1) ?? {};
  const counts = {
    errors: Number(last.errors ?? 0),
    nonLocal: Number(last.nonLocal ?? 0),
    contextLost: Number(last.contextLost ?? 0),
  };
  const { markdown, result } = summaryMarkdown(rows, meta, counts);
  writeFileSync(join(dir, 'summary.md'), markdown);
  await renderChart(chartHtml(rows, meta), join(dir, 'chart.png'));
  return result;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  const dir = process.argv[2];
  if (!dir) throw new Error('usage: node scripts/soak/report.mjs <run folder>');
  const result = await writeReport(resolve(dir));
  console.log(`${result.pass ? 'PASS' : 'FAIL'}: ${join(resolve(dir), 'summary.md')}`);
}
