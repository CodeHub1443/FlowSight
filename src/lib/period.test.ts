import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PERF_RANGE,
  offsetInPeriod,
  parseRange,
  periodDays,
  periodWindow,
  previousWindow,
  refetchIntervalOf,
  type SiteCalendar,
} from './period';

const SITE: SiteCalendar = {
  businessDayStart: '06:00',
  shifts: [
    { id: 'A', start: '06:00', end: '14:00' },
    { id: 'B', start: '14:00', end: '22:00' },
    { id: 'C', start: '22:00', end: '06:00' },
  ],
};
const at = (s: string) => Date.parse(s);
const isoOf = (ms: number) => new Date(ms).toISOString();

describe('parseRange', () => {
  it('accepts shift, day and week, defaults to day', () => {
    expect(parseRange('shift')).toBe('shift');
    expect(parseRange('week')).toBe('week');
    expect(parseRange(null)).toBe('day');
    expect(parseRange('month')).toBe('day');
    expect(DEFAULT_PERF_RANGE).toBe('day');
  });
});

describe('periodWindow (Asia/Dhaka)', () => {
  it('day = the business day from 06:00, data up to now', () => {
    const now = at('2026-10-24T19:20:00+06:00');
    const w = periodWindow('day', now, SITE);
    expect(isoOf(w.start)).toBe(isoOf(at('2026-10-24T06:00:00+06:00')));
    expect(isoOf(w.end)).toBe(isoOf(at('2026-10-25T06:00:00+06:00')));
    expect(w.to).toBe(now);
  });

  it('before 06:00 the business day is still yesterday', () => {
    const w = periodWindow('day', at('2026-10-25T03:10:00+06:00'), SITE);
    expect(isoOf(w.start)).toBe(isoOf(at('2026-10-24T06:00:00+06:00')));
  });

  it('shift = the running shift, including the overnight one', () => {
    const b = periodWindow('shift', at('2026-10-24T19:20:00+06:00'), SITE);
    expect(isoOf(b.start)).toBe(isoOf(at('2026-10-24T14:00:00+06:00')));
    expect(isoOf(b.end)).toBe(isoOf(at('2026-10-24T22:00:00+06:00')));
    const c = periodWindow('shift', at('2026-10-25T02:00:00+06:00'), SITE);
    expect(isoOf(c.start)).toBe(isoOf(at('2026-10-24T22:00:00+06:00')));
    expect(isoOf(c.end)).toBe(isoOf(at('2026-10-25T06:00:00+06:00')));
  });

  it('a shift gap falls back to the day', () => {
    const gappy: SiteCalendar = {
      businessDayStart: '06:00',
      shifts: [{ id: 'A', start: '06:00', end: '14:00' }],
    };
    const w = periodWindow('shift', at('2026-10-24T19:20:00+06:00'), gappy);
    expect(w.range).toBe('day');
    expect(isoOf(w.start)).toBe(isoOf(at('2026-10-24T06:00:00+06:00')));
  });

  it('week = the last 7 business days including today', () => {
    const w = periodWindow('week', at('2026-10-24T19:20:00+06:00'), SITE);
    expect(isoOf(w.start)).toBe(isoOf(at('2026-10-18T06:00:00+06:00')));
    expect(isoOf(w.end)).toBe(isoOf(at('2026-10-25T06:00:00+06:00')));
    expect(periodDays(w)).toBe(7);
  });
});

describe('previousWindow', () => {
  it('has the same length and ends where the period starts', () => {
    const now = at('2026-10-24T19:20:00+06:00');
    for (const range of ['shift', 'day', 'week'] as const) {
      const w = periodWindow(range, now, SITE);
      const p = previousWindow(w);
      expect(p.end).toBe(w.start);
      expect(p.end - p.start).toBe(w.end - w.start);
      expect(p.to).toBe(p.end);
    }
    const p = previousWindow(periodWindow('shift', now, SITE));
    expect(isoOf(p.start)).toBe(isoOf(at('2026-10-24T06:00:00+06:00')));
  });

  it('aligns the same moment of both periods by offset', () => {
    const w = periodWindow('day', at('2026-10-24T19:20:00+06:00'), SITE);
    const p = previousWindow(w);
    expect(offsetInPeriod(w, at('2026-10-24T09:00:00+06:00'))).toBe(
      offsetInPeriod(p, at('2026-10-23T09:00:00+06:00')),
    );
  });
});

describe('refetchIntervalOf', () => {
  it('refetches shift and day every 60 s, never week', () => {
    expect(refetchIntervalOf('shift')).toBe(60_000);
    expect(refetchIntervalOf('day')).toBe(60_000);
    expect(refetchIntervalOf('week')).toBe(false);
  });
});
