import { describe, expect, it } from 'vitest';
import type { Series } from '@/domain';
import type { PeriodWindow } from '../selectors';
import { buildTrend } from './trendSelectors';

// task 20.10: the partial slot (D1) and unknown data (D2) in the trend selectors.
const H = 3_600_000;
const D = 24 * H;
const DAY_START = Date.parse('2026-10-24T06:00:00+06:00');

const win = (start: number, length: number, to: number): PeriodWindow => ({
  range: 'day',
  start,
  end: start + length,
  to,
});
const weekWin = (start: number, to: number): PeriodWindow => ({
  range: 'week',
  start,
  end: start + 7 * D,
  to,
});
const series = (key: string, start: number, pairs: [number, number | null][]): Series => ({
  key,
  label: { en: key, bn: key },
  points: pairs.map(([h, v]) => ({ t: new Date(start + h * H).toISOString(), v })),
});
const allNull = (key: string, start: number, hours: number): Series =>
  series(
    key,
    start,
    Array.from({ length: hours }, (_, h): [number, number | null] => [h, null]),
  );

describe('buildTrend: partial slot', () => {
  const prevStart = DAY_START - D;
  const prevWin = win(prevStart, D, DAY_START);
  const known = (): Series[] => [
    series('B01.OUT', prevStart, [
      [0, 10],
      [1, 20],
      [2, 30],
      [3, 40],
    ]),
  ];

  it('the hour in progress is the partial slot, counted until now', () => {
    const now = DAY_START + 2.5 * H;
    const t = buildTrend({
      range: 'day',
      current: { window: win(DAY_START, D, now), series: [series('B01.OUT', DAY_START, [[2, 3]])] },
      previous: { window: prevWin, series: known() },
    });
    expect(t.partialIndex).toBe(2);
    expect(t.partialUntil).toBe(now);
    // nothing is extrapolated: the slot keeps the cartons it has so far
    expect(t.current[2]).toBe(3);
    // the previous period stays full buckets
    expect(t.previous.slice(0, 4)).toEqual([10, 20, 30, 40]);
  });

  it('no partial slot on an exact hour boundary or before the period starts', () => {
    const cur = (to: number) => ({ window: win(DAY_START, D, to), series: [] as Series[] });
    const a = buildTrend({
      range: 'day',
      current: cur(DAY_START + 2 * H),
      previous: { window: prevWin, series: known() },
    });
    expect(a.partialIndex).toBeNull();
    expect(a.partialUntil).toBeNull();
    const b = buildTrend({
      range: 'day',
      current: cur(DAY_START),
      previous: { window: prevWin, series: known() },
    });
    expect(b.partialIndex).toBeNull();
  });

  it('the week: the current day is the partial slot', () => {
    const weekStart = DAY_START - 6 * D;
    const now = weekStart + 6 * D + 4 * H;
    const t = buildTrend({
      range: 'week',
      current: { window: weekWin(weekStart, now), series: [] },
      previous: { window: weekWin(weekStart - 7 * D, weekStart), series: [] },
    });
    expect(t.partialIndex).toBe(6);
    expect(t.partialUntil).toBe(now);
  });

  it('a finished period has no partial slot', () => {
    const t = buildTrend({
      range: 'day',
      current: { window: win(DAY_START, D, DAY_START + D), series: [] },
      previous: { window: prevWin, series: known() },
    });
    expect(t.partialIndex).toBeNull();
    expect(t.elapsedSlots).toBe(24);
  });
});

describe('buildTrend: unknown is not zero', () => {
  const prevStart = DAY_START - D;
  const prevWin = win(prevStart, D, DAY_START);
  const cur = (to: number) => ({
    window: win(DAY_START, D, to),
    series: [series('B01.OUT', DAY_START, [[0, 5]])],
  });
  const prevWith = (pairs: [number, number | null][]) => ({
    window: prevWin,
    series: [series('B01.OUT', prevStart, pairs)],
  });

  it('previous buckets with only null points are null; others stay numbers', () => {
    const t = buildTrend({
      range: 'day',
      current: cur(DAY_START + 3 * H),
      previous: prevWith([
        [0, null],
        [1, null],
        [2, 30],
      ]),
    });
    expect(t.previous.slice(0, 4)).toEqual([null, null, 30, 0]);
    expect(t.previousFull).toBe(30);
  });

  it('known previous: the difference is computed', () => {
    const t = buildTrend({
      range: 'day',
      current: cur(DAY_START + 2 * H),
      previous: prevWith([
        [0, 10],
        [1, 20],
      ]),
    });
    expect(t.previousKnown).toBe(true);
    expect(t.previousToDate).toBe(30);
    expect(t.deltaPct).toBeCloseTo(((5 - 30) / 30) * 100, 9);
  });

  it('partially unknown up to the same point: no total and no difference', () => {
    const t = buildTrend({
      range: 'day',
      current: cur(DAY_START + 3 * H),
      previous: prevWith([
        [0, null],
        [1, null],
        [2, 30],
      ]),
    });
    expect(t.previousKnown).toBe(false);
    expect(t.previousToDate).toBeNull();
    expect(t.deltaPct).toBeNull();
  });

  it('unknown buckets after the same point do not matter', () => {
    const t = buildTrend({
      range: 'day',
      current: cur(DAY_START + 2 * H),
      previous: prevWith([
        [0, 10],
        [1, 20],
        [2, null],
      ]),
    });
    expect(t.previousKnown).toBe(true);
    expect(t.deltaPct).toBeCloseTo(((5 - 30) / 30) * 100, 9);
  });

  it('known but a total of 0: no difference, the previous total is still known', () => {
    const t = buildTrend({
      range: 'day',
      current: cur(DAY_START + 2 * H),
      previous: prevWith([
        [0, 0],
        [1, 0],
      ]),
    });
    expect(t.previousKnown).toBe(true);
    expect(t.previousToDate).toBe(0);
    expect(t.deltaPct).toBeNull();
  });

  it('no history at all: every bucket null, no total, no difference', () => {
    const t = buildTrend({
      range: 'day',
      current: cur(DAY_START + 2 * H),
      previous: { window: prevWin, series: [allNull('B01.OUT', prevStart, 24)] },
    });
    expect(t.previous.every((v) => v === null)).toBe(true);
    expect(t.previousKnown).toBe(false);
    expect(t.previousToDate).toBeNull();
    expect(t.deltaPct).toBeNull();
  });

  it('the week: a previous day with only null hours is a null slot', () => {
    const weekStart = DAY_START - 6 * D;
    const prevWeekStart = weekStart - 7 * D;
    const t = buildTrend({
      range: 'week',
      current: { window: weekWin(weekStart, weekStart + 2 * D), series: [] },
      previous: {
        window: weekWin(prevWeekStart, weekStart),
        series: [allNull('B01.OUT', prevWeekStart, 24)],
      },
    });
    expect(t.previous[0]).toBeNull();
    expect(t.previous[1]).toBe(0);
    expect(t.previousKnown).toBe(false);
  });
});
