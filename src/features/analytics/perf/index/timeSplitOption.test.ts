import { describe, expect, it } from 'vitest';
import type { BayPerfRow } from '@/domain';
import type { Fmt } from '@/features/live/useFmt';
import type { ChartTokens } from '../../chart/theme';
import { AXIS_HEADROOM, headroomMax, timeSplitOption, type T } from './timeSplitOption';

describe('headroomMax (W2 value axis maximum)', () => {
  it('is 0 when there is nothing to draw', () => {
    expect(headroomMax(0)).toBe(0);
    expect(headroomMax(-3)).toBe(0);
    expect(headroomMax(Number.NaN)).toBe(0);
  });

  it('holds the value with at most 10 % to spare', () => {
    for (const v of [7, 37, 52, 61.5, 83, 97, 101, 148, 337, 1234]) {
      const m = headroomMax(v);
      expect(m).toBeGreaterThanOrEqual(v);
      expect(m).toBeLessThanOrEqual(v * (1 + AXIS_HEADROOM) + 1e-9);
    }
    expect(headroomMax(37)).toBe(40);
    expect(headroomMax(52)).toBe(55);
  });

  it('does not jump to 100 for a value in the 60s or 70s', () => {
    expect(headroomMax(61)).toBeLessThan(70);
    expect(headroomMax(73)).toBeLessThan(81);
  });

  it('an exact round value stays as it is', () => {
    expect(headroomMax(60)).toBe(60);
    expect(headroomMax(100)).toBe(100);
  });
});

describe('timeSplitOption axis', () => {
  const tokens = { ink600: 'g', ink900: 'k', card: 'w' } as unknown as ChartTokens;
  const fmt = { lang: 'en', durHM: (m: number | null) => String(m) } as unknown as Fmt;
  const t: T = (key) => key;
  const row = (bay: string, pre: number, work: number, post: number): BayPerfRow =>
    ({
      bay,
      mean: { preOpMin: pre, activeMin: work, postOpMin: post, occupancyMin: pre + work + post },
    }) as unknown as BayPerfRow;

  it('sets the maximum with at most 10 % headroom and puts the unit at the axis end', () => {
    const o = timeSplitOption({
      rows: [row('B01', 10, 40, 7), row('B02', 5, 30, 5)],
      median: 50,
      fmt,
      tokens,
      t,
    });
    const x = o.xAxis as unknown as { max?: number; nameLocation?: string };
    expect(x.max).toBe(headroomMax(57));
    expect(x.max).toBeLessThanOrEqual(57 * 1.1 + 1e-9);
    expect(x.nameLocation).toBe('end');
  });
});
