import { describe, expect, it } from 'vitest';
import type { Fmt } from '@/features/live/useFmt';
import type { ChartTokens } from '../../chart/theme';
import { trendOption, type T } from './trendOption';
import type { Trend } from './trendSelectors';

const tokens = { uiBlue: 'blue', ink400: 'grey', card: 'white' } as unknown as ChartTokens;
const fmt = {
  num: (n: number) => String(n),
  clock: (t: number | Date | string) => `clock(${String(t)})`,
} as unknown as Fmt;
const dict: Record<string, string> = {
  'throughput.cartons': '{n} cartons',
  'throughput.soFar': '{value} so far (until {time})',
};
const t: T = (key, opts = {}) =>
  (dict[key] ?? key).replace(/\{(\w+)\}/g, (_, k: string) => String(opts[k] ?? ''));

const base: Trend = {
  unit: 'hour',
  slotStarts: [0, 1, 2, 3],
  current: [4, 6, 3, null],
  previous: [5, null, 7, 8],
  elapsedSlots: 3,
  partialIndex: 2,
  partialUntil: 777,
  currentTotal: 13,
  previousToDate: null,
  previousKnown: false,
  previousFull: 20,
  deltaPct: null,
};

const build = (trend: Trend) =>
  trendOption({
    trend,
    labels: ['a', 'b', 'c', 'd'],
    currentName: 'Today',
    previousName: 'Yesterday',
    fmt,
    tokens,
    t,
  });

type Pt = { value: number | null; symbol?: string; itemStyle?: { color: string } } | null;
type S = {
  name: string;
  data: (Pt | number | null)[];
  lineStyle?: { type?: string };
  connectNulls?: boolean;
};
const seriesOf = (o: ReturnType<typeof build>): S[] => o.series as unknown as S[];
const tooltipOf = (o: ReturnType<typeof build>) =>
  (o.tooltip as unknown as { formatter: (p: unknown) => string }).formatter;

describe('trendOption: partial slot', () => {
  it('the full buckets are a solid series that stops before the slot in progress', () => {
    const cur = seriesOf(build(base))[1];
    expect(cur?.name).toBe('Today');
    expect(cur?.data).toEqual([4, 6, null, null]);
    expect(cur?.lineStyle?.type).toBeUndefined();
  });

  it('the slot in progress is a hollow marker joined to the last full bucket by a dashed segment', () => {
    const partial = seriesOf(build(base))[2];
    expect(partial?.lineStyle?.type).toBe('dashed');
    const d = partial?.data ?? [];
    expect(d[0]).toBeNull();
    // the segment starts at the previous bucket without a marker of its own
    expect(d[1]).toEqual({ value: 6, symbol: 'none' });
    // hollow = card colour inside, line colour as the ring
    expect(d[2]).toMatchObject({
      value: 3,
      symbol: 'circle',
      itemStyle: { color: 'white', borderColor: 'blue' },
    });
    expect(d[3]).toBeNull();
    // nothing is extrapolated: the dash ends at the cartons counted so far
    expect(d.filter((p) => p !== null)).toHaveLength(2);
  });

  it('keeps the dashed series out of the legend; the previous period shows the dash', () => {
    const legend = build(base).legend as unknown as {
      data: { name: string; lineStyle?: { type: string } }[];
    };
    expect(legend.data.map((e) => e.name)).toEqual(['Today', 'Yesterday']);
    expect(legend.data[1]?.lineStyle?.type).toBe('dashed');
    expect(legend.data[0]?.lineStyle).toBeUndefined();
  });

  it('without a partial slot there is no dashed current series', () => {
    const o = build({ ...base, partialIndex: null, partialUntil: null });
    expect(seriesOf(o)).toHaveLength(2);
    expect(seriesOf(o)[1]?.data).toEqual([4, 6, 3, null]);
  });

  it('a partial first slot is a lone hollow marker with no segment to join', () => {
    const o = build({ ...base, partialIndex: 0, current: [2, null, null, null] });
    expect(seriesOf(o)[2]?.data.filter((p) => p !== null)).toHaveLength(1);
    expect(seriesOf(o)[1]?.data.every((v) => v === null)).toBe(true);
  });

  it('the tooltip says "so far (until time)" for the slot in progress only', () => {
    const f = tooltipOf(build(base));
    expect(f([{ dataIndex: 2 }])).toContain('3 cartons so far (until clock(777))');
    const full = f([{ dataIndex: 0 }]);
    expect(full).toContain('4 cartons');
    expect(full).not.toContain('so far');
  });
});

describe('trendOption: unknown is a gap', () => {
  it('a null previous bucket stays null in the data, unconnected', () => {
    const prev = seriesOf(build(base))[0];
    expect(prev?.name).toBe('Yesterday');
    expect(prev?.data).toEqual([5, null, 7, 8]);
    expect(prev?.connectNulls).toBe(false);
    expect(prev?.lineStyle?.type).toBe('dashed');
  });

  it('the tooltip shows a dash for an unknown value, never 0', () => {
    const html = tooltipOf(build(base))([{ dataIndex: 1 }]);
    expect(html).toContain('—');
    expect(html).not.toContain('0 cartons');
  });
});
