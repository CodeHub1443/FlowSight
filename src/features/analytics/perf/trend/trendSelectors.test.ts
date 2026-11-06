import { describe, expect, it } from 'vitest';
import type { Series } from '@/domain';
import type { PeriodWindow } from '../selectors';
import {
  bayOfSeriesKey,
  buildTrend,
  detentionCells,
  hourlyTotals,
  judgeTrend,
  trendUnitOf,
} from './trendSelectors';

const H = 3_600_000;
const D = 24 * H;
// a business day starts at 06:00 Dhaka (UTC+6)
const DAY_START = Date.parse('2026-10-24T06:00:00+06:00');

const win = (start: number, length: number, to: number): PeriodWindow => ({
  range: 'day',
  start,
  end: start + length,
  to,
});

/** One series with a value per hour offset: [[hourOffset, value], ...]. */
const series = (key: string, start: number, pairs: [number, number | null][]): Series => ({
  key,
  label: { en: key, bn: key },
  points: pairs.map(([h, v]) => ({ t: new Date(start + h * H).toISOString(), v })),
});

describe('trendUnitOf / bayOfSeriesKey', () => {
  it('hourly for shift and day, per day for the week', () => {
    expect(trendUnitOf('shift')).toBe('hour');
    expect(trendUnitOf('day')).toBe('hour');
    expect(trendUnitOf('week')).toBe('day');
  });
  it('reads the bay from a series key', () => {
    expect(bayOfSeriesKey('B03.OUT')).toBe('B03');
  });
});

describe('hourlyTotals', () => {
  const w = win(DAY_START, D, DAY_START + D);
  const all = [
    series('B01.OUT', DAY_START, [
      [0, 10],
      [1, 20],
    ]),
    series('B01.IN', DAY_START, [
      [0, 5],
      [1, null],
    ]),
    series('B02.OUT', DAY_START, [[1, 7]]),
  ];

  it('sums every bay and both directions; null values add nothing', () => {
    const m = hourlyTotals(all, w);
    expect(m.get(0)).toBe(15);
    expect(m.get(1)).toBe(27);
  });

  it('filters by bay', () => {
    const m = hourlyTotals(all, w, 'B02');
    expect(m.get(0)).toBeUndefined();
    expect(m.get(1)).toBe(7);
  });

  it('ignores points outside the period', () => {
    const m = hourlyTotals(
      [
        series('B01.OUT', DAY_START, [
          [-1, 99],
          [24, 99],
          [3, 4],
        ]),
      ],
      w,
    );
    expect([...m.entries()]).toEqual([[3, 4]]);
  });
});

describe('buildTrend: day (hourly points)', () => {
  const prevStart = DAY_START - D;
  const previous = {
    window: win(prevStart, D, DAY_START),
    series: [
      series('B01.OUT', prevStart, [
        [0, 10],
        [1, 20],
        [2, 30],
        [3, 40],
      ]),
    ],
  };

  it('aligns the previous period by offset and has one slot per hour', () => {
    const now = DAY_START + 2 * H; // exactly two hours in
    const cur = {
      window: win(DAY_START, D, now),
      series: [
        series('B01.OUT', DAY_START, [
          [0, 1],
          [1, 2],
        ]),
      ],
    };
    const t = buildTrend({ range: 'day', current: cur, previous });
    expect(t.unit).toBe('hour');
    expect(t.slotStarts).toHaveLength(24);
    expect(t.slotStarts[0]).toBe(DAY_START);
    expect(t.slotStarts[2]).toBe(DAY_START + 2 * H);
    // slot 2 of the current day is compared with slot 2 of yesterday
    expect(t.previous.slice(0, 4)).toEqual([10, 20, 30, 40]);
    expect(t.previous).toHaveLength(24);
  });

  it('stops the current line at now: no zeros for the future', () => {
    const now = DAY_START + 2.5 * H; // hour 2 is in progress
    const cur = {
      window: win(DAY_START, D, now),
      series: [
        series('B01.OUT', DAY_START, [
          [0, 1],
          [1, 2],
          [2, 3],
        ]),
      ],
    };
    const t = buildTrend({ range: 'day', current: cur, previous });
    expect(t.elapsedSlots).toBe(3);
    expect(t.current.slice(0, 3)).toEqual([1, 2, 3]);
    expect(t.current.slice(3).every((v) => v === null)).toBe(true);
    expect(t.current).toHaveLength(24);
  });

  it('a quiet hour that has started is a real zero, not a gap', () => {
    const cur = {
      window: win(DAY_START, D, DAY_START + 3 * H),
      series: [series('B01.OUT', DAY_START, [[0, 4]])],
    };
    const t = buildTrend({ range: 'day', current: cur, previous });
    expect(t.current.slice(0, 4)).toEqual([4, 0, 0, null]);
  });

  it('totals, previous at the same point (hour in progress pro-rated) and the difference', () => {
    const now = DAY_START + 2.5 * H;
    const cur = {
      window: win(DAY_START, D, now),
      series: [
        series('B01.OUT', DAY_START, [
          [0, 10],
          [1, 20],
          [2, 5],
        ]),
      ],
    };
    const t = buildTrend({ range: 'day', current: cur, previous });
    expect(t.currentTotal).toBe(35);
    // 10 + 20 + half of 30
    expect(t.previousToDate).toBeCloseTo(45, 9);
    expect(t.previousFull).toBe(100);
    expect(t.deltaPct).toBeCloseTo(((35 - 45) / 45) * 100, 9);
  });

  it('the difference is null when the previous total at that point is 0', () => {
    const cur = {
      window: win(DAY_START, D, DAY_START + 2 * H),
      series: [series('B01.OUT', DAY_START, [[0, 8]])],
    };
    const t = buildTrend({
      range: 'day',
      current: cur,
      previous: { window: win(prevStart, D, DAY_START), series: [] },
    });
    expect(t.previousToDate).toBe(0);
    expect(t.deltaPct).toBeNull();
  });

  it('the bay filter applies to both periods', () => {
    const cur = {
      window: win(DAY_START, D, DAY_START + 2 * H),
      series: [series('B01.OUT', DAY_START, [[0, 1]]), series('B02.OUT', DAY_START, [[0, 100]])],
    };
    const prev = {
      window: win(prevStart, D, DAY_START),
      series: [series('B01.OUT', prevStart, [[0, 2]]), series('B02.OUT', prevStart, [[0, 200]])],
    };
    const t = buildTrend({ range: 'day', current: cur, previous: prev, bay: 'B02' });
    expect(t.currentTotal).toBe(100);
    expect(t.previous[0]).toBe(200);
  });
});

describe('buildTrend: week (per-day totals)', () => {
  const weekStart = DAY_START - 6 * D;
  const prevWeekStart = weekStart - 7 * D;
  const weekWin = (start: number, to: number): PeriodWindow => ({
    range: 'week',
    start,
    end: start + 7 * D,
    to,
  });

  it('aggregates hourly points into 7 business-day totals, previous week aligned by offset', () => {
    // today is day 6 (the 7th), 10:00 in: 4 hours elapsed
    const now = weekStart + 6 * D + 4 * H;
    const cur = {
      window: weekWin(weekStart, now),
      series: [
        series('B01.OUT', weekStart, [
          [0, 1],
          [23, 2], // last hour of business day 0
          [24, 3], // first hour of business day 1
          [24 * 6, 4],
          [24 * 6 + 3, 5],
        ]),
        series('B01.IN', weekStart, [[1, 10]]),
      ],
    };
    const prev = {
      window: weekWin(prevWeekStart, weekStart),
      series: [
        series('B01.OUT', prevWeekStart, [
          [0, 100],
          [24 * 6, 50],
          [24 * 6 + 10, 1000],
        ]),
      ],
    };
    const t = buildTrend({ range: 'week', current: cur, previous: prev });
    expect(t.unit).toBe('day');
    expect(t.slotStarts).toEqual(Array.from({ length: 7 }, (_, i) => weekStart + i * D));
    expect(t.current).toEqual([13, 3, 0, 0, 0, 0, 9]);
    expect(t.previous).toEqual([100, 0, 0, 0, 0, 0, 1050]);
    expect(t.elapsedSlots).toBe(7);
    expect(t.currentTotal).toBe(25);
    expect(t.previousFull).toBe(1150);
    // the same point in time = 6 days + 4 hours into the previous week: hour 10 of its last day is not yet reached
    expect(t.previousToDate).toBe(150);
    expect(t.deltaPct).toBeCloseTo(((25 - 150) / 150) * 100, 9);
  });

  it('days that have not started are null on the current line', () => {
    const now = weekStart + 2 * D + 2 * H; // third day in progress
    const t = buildTrend({
      range: 'week',
      current: {
        window: weekWin(weekStart, now),
        series: [series('B01.OUT', weekStart, [[0, 6]])],
      },
      previous: { window: weekWin(prevWeekStart, weekStart), series: [] },
    });
    expect(t.elapsedSlots).toBe(3);
    expect(t.current).toEqual([6, 0, 0, null, null, null, null]);
    expect(t.previous).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('judgeTrend', () => {
  const base = {
    unit: 'hour' as const,
    slotStarts: [],
    current: [],
    previous: [],
    elapsedSlots: 1,
    currentTotal: 0,
    partialIndex: null,
    partialUntil: null,
    previousToDate: 0,
    previousKnown: true,
    previousFull: 0,
    deltaPct: null,
  };
  it('insufficient before anything has started', () => {
    expect(judgeTrend({ ...base, elapsedSlots: 0 })).toBe('insufficient');
  });
  it('empty without any cartons in either period', () => {
    expect(judgeTrend(base)).toBe('empty');
  });
  it('ready when either period has cartons', () => {
    expect(judgeTrend({ ...base, currentTotal: 3 })).toBe('ready');
    expect(judgeTrend({ ...base, previousFull: 3 })).toBe('ready');
  });
});

describe('detentionCells', () => {
  it('keeps the order of the rows and never sorts', () => {
    const cells = detentionCells([
      { bay: 'B01', visits: 3, detentions: 0 },
      { bay: 'B02', visits: 10, detentions: 9 },
      { bay: 'B03', visits: 4, detentions: 1 },
    ]);
    expect(cells.map((c) => c.bay)).toEqual(['B01', 'B02', 'B03']);
  });
  it('share of the bay visits, null without visits', () => {
    const cells = detentionCells([
      { bay: 'B01', visits: 4, detentions: 1 },
      { bay: 'B02', visits: 0, detentions: 0 },
    ]);
    expect(cells[0]?.sharePct).toBe(25);
    expect(cells[1]?.sharePct).toBeNull();
  });
});
