// Pure maths of the soak report: no browser, no files. Times are hours since the start of the run.

export function median(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function percentile(values, p) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length === 0) return null;
  return v[Math.min(v.length - 1, Math.floor(v.length * p))];
}

/** Least-squares slope of y over x, per unit of x. Null below 2 points or with no spread in x. */
export function slope(points) {
  const p = points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (p.length < 2) return null;
  const mx = p.reduce((s, [x]) => s + x, 0) / p.length;
  const my = p.reduce((s, [, y]) => s + y, 0) / p.length;
  let num = 0;
  let den = 0;
  for (const [x, y] of p) {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

/** The numeric series `key` of the rows at or after `fromH`, as [hours, value]. Empty CSV cells are skipped. */
export function series(rows, key, fromH = 0) {
  return rows
    .filter((r) => r.hours >= fromH && r[key] !== null && r[key] !== '' && r[key] !== undefined)
    .map((r) => [r.hours, Number(r[key])])
    .filter(([, y]) => Number.isFinite(y));
}

/**
 * Flat means the last third of the run reaches no higher than the first third did. Counts that move with the state of the
 * page (theme, open panels, trucks on site) repeat their peaks; a leak does not stop at the old peak.
 */
export function isFlat(points, { share = 0, absolute = 0 } = {}) {
  if (points.length < 6) return { flat: null, firstMax: null, lastMax: null };
  const third = Math.max(1, Math.floor(points.length / 3));
  const firstMax = Math.max(...points.slice(0, third).map(([, y]) => y));
  const lastMax = Math.max(...points.slice(-third).map(([, y]) => y));
  return { flat: lastMax <= firstMax * (1 + share) + absolute, firstMax, lastMax };
}

export const CRITERIA = {
  heapSlopeMBPerHour: 5,
  fpsDropShare: 0.05,
  /** Room for what the page is showing at the moment a sample lands. */
  domGrowthShare: 0.05,
};

/** The stretch compared for fps: an hour, or a third of what follows the warm-up on a shorter run. */
export function fpsWindows(rows, warmupH) {
  const after = rows.filter((r) => r.hours >= warmupH);
  const end = rows.at(-1)?.hours ?? warmupH;
  const span = Math.min(1, (end - warmupH) / 3);
  const inWindow = (from, to, list = after) =>
    list.filter((r) => r.hours >= from && r.hours <= to).map((r) => Number(r.medianFps));
  const first = median(inWindow(warmupH, warmupH + span));
  const last = median(inWindow(end - span, end));
  return { spanH: span, first, last, drop: first && last !== null ? (first - last) / first : null };
}

/** Evaluates a run against the pass criteria of the soak test. `rows` are CSV rows with `hours` as a number. */
export function evaluate(rows, { warmupH, errors = 0, nonLocal = 0, contextLost = 0 }) {
  const heapPoints = series(rows, 'heapAfterGcMB', warmupH);
  const heapRaw = series(rows, 'heapMB', warmupH);
  const heapSlope = slope(heapPoints.length >= 3 ? heapPoints : heapRaw);
  const geometries = series(rows, 'geometries', warmupH);
  const textures = series(rows, 'textures', warmupH);
  const domPoints = series(rows, 'nodesAfterGc', warmupH);
  const dom = domPoints.length >= 6 ? domPoints : series(rows, 'domNodes', warmupH);
  const listeners = series(rows, 'listenersAfterGc', warmupH);
  const fps = fpsWindows(rows, warmupH);
  const stepsAtEnd = Number(rows.at(-1)?.tierSteps ?? 0);
  const stepsAtWarmup = Number(rows.find((r) => r.hours >= warmupH)?.tierSteps ?? 0);
  const checks = [
    {
      id: 'heap',
      label: `Heap slope after warm-up < ${CRITERIA.heapSlopeMBPerHour} MB/h`,
      value: heapSlope,
      unit: 'MB/h',
      pass: heapSlope === null ? null : heapSlope < CRITERIA.heapSlopeMBPerHour,
    },
    {
      id: 'geometries',
      label: 'WebGL geometries flat',
      value: slope(geometries),
      unit: '/h',
      detail: isFlat(geometries),
      pass: isFlat(geometries).flat,
    },
    {
      id: 'textures',
      label: 'WebGL textures flat',
      value: slope(textures),
      unit: '/h',
      detail: isFlat(textures),
      pass: isFlat(textures).flat,
    },
    {
      id: 'dom',
      label: 'DOM nodes flat',
      value: slope(dom),
      unit: '/h',
      detail: isFlat(dom, { share: CRITERIA.domGrowthShare }),
      pass: isFlat(dom, { share: CRITERIA.domGrowthShare }).flat,
    },
    {
      id: 'listeners',
      label: 'Event listeners flat',
      value: slope(listeners),
      unit: '/h',
      detail: isFlat(listeners, { share: CRITERIA.domGrowthShare }),
      pass: isFlat(listeners, { share: CRITERIA.domGrowthShare }).flat,
    },
    {
      id: 'fps',
      label: `Fps drop < ${CRITERIA.fpsDropShare * 100} %`,
      value: fps.drop === null ? null : fps.drop * 100,
      unit: '%',
      detail: fps,
      pass: fps.drop === null ? null : fps.drop < CRITERIA.fpsDropShare,
    },
    {
      id: 'tier',
      label: 'No tier step after warm-up',
      value: stepsAtEnd - stepsAtWarmup,
      unit: 'steps',
      pass: stepsAtEnd === stepsAtWarmup,
    },
    { id: 'errors', label: 'No errors', value: errors, unit: '', pass: errors === 0 },
    {
      id: 'context',
      label: 'No WebGL context lost',
      value: contextLost,
      unit: '',
      pass: contextLost === 0,
    },
    {
      id: 'network',
      label: 'No non-local requests',
      value: nonLocal,
      unit: '',
      pass: nonLocal === 0,
    },
  ];
  return { checks, pass: checks.every((c) => c.pass === true) };
}

/** Parses `50m@1,10m@60`; `Nh` works too. */
export function parsePhases(text) {
  return text.split(',').map((part) => {
    const m = /^(\d+(?:\.\d+)?)(m|h)@(\d+)$/.exec(part.trim());
    if (!m) throw new Error(`bad phase "${part}", expected like 50m@1`);
    return { minutes: Number(m[1]) * (m[2] === 'h' ? 60 : 1), speed: Number(m[3]) };
  });
}

/** Default schedule: the last sixth at 60x, the rest at 1x. */
export function defaultPhases(hours) {
  const minutes = hours * 60;
  return [
    { minutes: (minutes * 5) / 6, speed: 1 },
    { minutes: minutes / 6, speed: 60 },
  ];
}

/** Small seeded generator (mulberry32) for the simulated user: same seed, same session. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const quote = (v) =>
  /[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v);

export function csvLine(columns, row) {
  return columns.map((c) => quote(row[c] ?? '')).join(',');
}

export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const split = (line) => {
    const out = [];
    let cur = '';
    let inside = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inside && ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inside = !inside;
      else if (ch === ',' && !inside) {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const head = split(lines[0] ?? '');
  return lines.slice(1).map((line) => {
    const cells = split(line);
    const row = Object.fromEntries(head.map((h, i) => [h, cells[i] ?? '']));
    row.hours = Number(row.hours);
    return row;
  });
}
