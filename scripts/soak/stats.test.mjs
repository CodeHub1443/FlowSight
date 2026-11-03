// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  csvLine,
  defaultPhases,
  evaluate,
  fpsWindows,
  isFlat,
  median,
  parseCsv,
  parsePhases,
  percentile,
  seededRandom,
  slope,
} from './stats.mjs';

const hours = (n, step = 0.1) => Array.from({ length: n }, (_, i) => i * step);

function run(overrides = {}) {
  return hours(30).map((h) => ({
    hours: h,
    heapAfterGcMB: 80,
    heapMB: 90,
    geometries: 200,
    textures: 40,
    nodesAfterGc: 3000,
    domNodes: 3000,
    listenersAfterGc: 500,
    medianFps: 60,
    tierSteps: 1,
    ...Object.fromEntries(Object.entries(overrides).map(([k, f]) => [k, f(h)])),
  }));
}

describe('statistics', () => {
  it('median and percentile ignore what is not a number', () => {
    expect(median([3, 1, NaN, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10);
  });

  it('slope is the least-squares fit', () => {
    expect(slope([[0, 1], [1, 3], [2, 5]])).toBeCloseTo(2); // prettier-ignore
    expect(slope([[0, 1]])).toBeNull();
    expect(slope([[1, 1], [1, 5]])).toBeNull(); // prettier-ignore
  });

  it('a saw-tooth is flat; a climb is not', () => {
    const saw = hours(30).map((h, i) => [h, 100 + (i % 3) * 10]);
    expect(isFlat(saw).flat).toBe(true);
    const climb = hours(30).map((h, i) => [h, 100 + i]);
    expect(isFlat(climb).flat).toBe(false);
    expect(isFlat([[0, 1]]).flat).toBeNull();
  });
});

describe('fps windows', () => {
  it('uses a third of a short run and an hour of a long one', () => {
    const short = hours(61, 1 / 60).map((h) => ({ hours: h, medianFps: 60 }));
    expect(fpsWindows(short, 1 / 6).spanH).toBeCloseTo((1 - 1 / 6) / 3);
    const long = hours(121, 0.1).map((h) => ({ hours: h, medianFps: 60 }));
    expect(fpsWindows(long, 1 / 6).spanH).toBe(1);
  });

  it('measures the drop from the first window to the last', () => {
    const rows = hours(61, 1 / 60).map((h) => ({ hours: h, medianFps: h < 0.5 ? 60 : 54 }));
    expect(fpsWindows(rows, 1 / 6).drop).toBeCloseTo(0.1);
  });
});

describe('pass criteria', () => {
  const failed = (rows, extra = {}) =>
    evaluate(rows, { warmupH: 1 / 6, ...extra })
      .checks.filter((c) => c.pass !== true)
      .map((c) => c.id);

  it('passes a flat run', () => {
    expect(evaluate(run(), { warmupH: 1 / 6 }).pass).toBe(true);
  });

  it.each([
    ['heap', { heapAfterGcMB: (h) => 80 + 6 * h }],
    ['geometries', { geometries: (h) => 200 + Math.floor(h * 10) }],
    ['textures', { textures: (h) => 40 + Math.floor(h * 10) }],
    ['dom', { nodesAfterGc: (h) => 3000 + h * 1000 }],
    ['listeners', { listenersAfterGc: (h) => 500 + h * 200 }],
    ['fps', { medianFps: (h) => (h < 1.5 ? 60 : 55) }],
    ['tier', { tierSteps: (h) => (h > 2 ? 2 : 1) }],
  ])('fails on %s', (id, overrides) => {
    expect(failed(run(overrides))).toEqual([id]);
  });

  it('counts the tier climb of the warm-up as planned', () => {
    const rows = run({ tierSteps: (h) => (h < 0.1 ? 0 : 1) });
    expect(failed(rows)).toEqual([]);
  });

  it('fails on errors, a lost context and non-local requests', () => {
    expect(failed(run(), { errors: 1 })).toEqual(['errors']);
    expect(failed(run(), { contextLost: 1 })).toEqual(['context']);
    expect(failed(run(), { nonLocal: 2 })).toEqual(['network']);
  });

  it('does not pass a run too short to judge', () => {
    expect(evaluate(run().slice(0, 3), { warmupH: 1 / 6 }).pass).toBe(false);
  });
});

describe('schedule', () => {
  it('parses phases', () => {
    expect(parsePhases('50m@1,10m@60')).toEqual([
      { minutes: 50, speed: 1 },
      { minutes: 10, speed: 60 },
    ]);
    expect(parsePhases('2h@1')).toEqual([{ minutes: 120, speed: 1 }]);
    expect(() => parsePhases('soon')).toThrow();
  });

  it('defaults to 50 + 10 minutes per hour', () => {
    expect(defaultPhases(1)).toEqual([
      { minutes: 50, speed: 1 },
      { minutes: 10, speed: 60 },
    ]);
    expect(defaultPhases(12).map((p) => p.minutes)).toEqual([600, 120]);
  });
});

describe('simulated user seed', () => {
  it('is deterministic and stays in 0..1', () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    const c = seededRandom(8);
    const seq = Array.from({ length: 50 }, () => a());
    expect(seq).toEqual(Array.from({ length: 50 }, () => b()));
    expect(seq).not.toEqual(Array.from({ length: 50 }, () => c()));
    expect(seq.every((v) => v >= 0 && v < 1)).toBe(true);
  });
});

describe('csv', () => {
  it('round-trips quoting and empty cells', () => {
    const cols = ['hours', 'a', 'b'];
    const text = `${cols.join(',')}\n${csvLine(cols, { hours: 0.5, a: 'x,"y"', b: null })}\n`;
    expect(parseCsv(text)).toEqual([{ hours: 0.5, a: 'x,"y"', b: '' }]);
  });
});
