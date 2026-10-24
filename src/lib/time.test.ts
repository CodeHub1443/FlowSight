// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ShiftWindow } from '../domain/types';
import { businessDayOf, formatClock, secondsSince, shiftBounds, shiftOf, toDhaka } from './time';

const shifts: ShiftWindow[] = [
  { id: 'A', start: '06:00', end: '14:00' },
  { id: 'B', start: '14:00', end: '22:00' },
  { id: 'C', start: '22:00', end: '06:00' },
];
const DAY_START = '06:00';
const iso = (d: Date | undefined) => d?.toISOString();

describe('toDhaka / formatClock', () => {
  it('reads Dhaka wall-clock from a UTC instant', () => {
    const d = toDhaka('2026-10-24T16:30:00Z');
    expect([d.getHours(), d.getMinutes(), d.getDate()]).toEqual([22, 30, 24]);
  });

  it('formats HH:mm and HH:mm:ss in Dhaka from UTC and offset inputs', () => {
    expect(formatClock('2026-10-24T16:30:00Z')).toBe('22:30');
    expect(formatClock('2026-10-24T19:50:45.120+06:00', { seconds: true })).toBe('19:50:45');
    expect(formatClock(Date.UTC(2026, 9, 24, 18, 5, 9), { seconds: true })).toBe('00:05:09');
    expect(formatClock(new Date('2026-10-24T19:50:45+06:00'))).toBe('19:50');
  });

  it('can use Bangla digits', () => {
    expect(formatClock('2026-10-24T19:50:45+06:00', { digits: 'bangla' })).toBe('১৯:৫০');
  });

  it('throws a RangeError for an invalid time', () => {
    expect(() => formatClock('nope')).toThrow(RangeError);
  });
});

describe('businessDayOf (day starts 06:00)', () => {
  it.each([
    ['2026-10-24T05:59:59+06:00', '2026-10-23'],
    ['2026-10-24T06:00:00+06:00', '2026-10-24'],
    ['2026-10-24T12:00:00+06:00', '2026-10-24'],
    ['2026-10-24T23:59:59+06:00', '2026-10-24'],
    ['2026-10-25T00:00:00+06:00', '2026-10-24'],
    ['2026-10-25T05:59:59+06:00', '2026-10-24'],
    ['2026-10-25T06:00:00+06:00', '2026-10-25'],
  ])('%s -> %s', (ts, day) => {
    expect(businessDayOf(ts, DAY_START)).toBe(day);
  });

  it('accepts UTC input (Dhaka is UTC+6)', () => {
    expect(businessDayOf('2026-10-24T18:00:00Z', DAY_START)).toBe('2026-10-24'); // 00:00 Dhaka on the 25th
    expect(businessDayOf('2026-10-24T23:59:59Z', DAY_START)).toBe('2026-10-24'); // 05:59:59 Dhaka on the 25th
    expect(businessDayOf('2026-10-25T00:00:00Z', DAY_START)).toBe('2026-10-25'); // 06:00 Dhaka
  });

  it('crosses month and year boundaries', () => {
    expect(businessDayOf('2026-11-01T02:00:00+06:00', DAY_START)).toBe('2026-10-31');
    expect(businessDayOf('2027-01-01T01:00:00+06:00', DAY_START)).toBe('2026-12-31');
    expect(businessDayOf('2028-03-01T01:00:00+06:00', DAY_START)).toBe('2028-02-29');
  });

  it('with a midnight day start, equals the calendar day', () => {
    expect(businessDayOf('2026-10-24T00:00:00+06:00', '00:00')).toBe('2026-10-24');
    expect(businessDayOf('2026-10-24T23:59:59+06:00', '00:00')).toBe('2026-10-24');
  });
});

describe('shiftOf', () => {
  it.each([
    ['2026-10-24T06:00:00+06:00', 'A', '2026-10-24'],
    ['2026-10-24T13:59:59+06:00', 'A', '2026-10-24'],
    ['2026-10-24T14:00:00+06:00', 'B', '2026-10-24'],
    ['2026-10-24T21:59:59+06:00', 'B', '2026-10-24'],
    ['2026-10-24T22:00:00+06:00', 'C', '2026-10-24'],
    ['2026-10-24T23:59:59+06:00', 'C', '2026-10-24'],
    ['2026-10-25T00:00:00+06:00', 'C', '2026-10-24'],
    ['2026-10-25T03:30:00+06:00', 'C', '2026-10-24'],
    ['2026-10-25T05:59:59+06:00', 'C', '2026-10-24'],
    ['2026-10-25T06:00:00+06:00', 'A', '2026-10-25'],
  ])('%s -> shift %s of business day %s', (ts, id, day) => {
    const s = shiftOf(ts, shifts, DAY_START);
    expect(s?.id).toBe(id);
    expect(s?.businessDay).toBe(day);
  });

  it('works with UTC input', () => {
    expect(shiftOf('2026-10-24T16:00:00Z', shifts, DAY_START)?.id).toBe('C'); // 22:00 Dhaka
    expect(shiftOf('2026-10-24T15:59:59Z', shifts, DAY_START)?.id).toBe('B');
    expect(shiftOf('2026-10-24T20:00:00Z', shifts, DAY_START)?.businessDay).toBe('2026-10-24'); // 02:00 on the 25th
  });

  it('returns the real start and end instants, also for the overnight shift', () => {
    const c = shiftOf('2026-10-25T01:00:00+06:00', shifts, DAY_START);
    expect(iso(c?.start)).toBe('2026-10-24T16:00:00.000Z');
    expect(iso(c?.end)).toBe('2026-10-25T00:00:00.000Z');
  });

  it('returns null when the config has a gap', () => {
    const gap: ShiftWindow[] = [{ id: 'A', start: '06:00', end: '14:00' }];
    expect(shiftOf('2026-10-24T20:00:00+06:00', gap, DAY_START)).toBeNull();
  });

  it('treats start == end as a full day', () => {
    const all: ShiftWindow[] = [{ id: 'D', start: '06:00', end: '06:00' }];
    expect(shiftOf('2026-10-25T05:00:00+06:00', all, DAY_START)?.businessDay).toBe('2026-10-24');
  });
});

describe('shiftBounds', () => {
  it('returns the day shifts on the business day', () => {
    const a = shiftBounds('2026-10-24', 'A', shifts, DAY_START);
    expect(iso(a?.start)).toBe('2026-10-24T00:00:00.000Z');
    expect(iso(a?.end)).toBe('2026-10-24T08:00:00.000Z');
    const b = shiftBounds('2026-10-24', 'B', shifts, DAY_START);
    expect(iso(b?.start)).toBe('2026-10-24T08:00:00.000Z');
    expect(iso(b?.end)).toBe('2026-10-24T16:00:00.000Z');
  });

  it('runs the overnight shift C across midnight into the next calendar day', () => {
    const c = shiftBounds('2026-10-24', 'C', shifts, DAY_START);
    expect(iso(c?.start)).toBe('2026-10-24T16:00:00.000Z'); // 22:00 on the 24th, Dhaka
    expect(iso(c?.end)).toBe('2026-10-25T00:00:00.000Z'); // 06:00 on the 25th
    expect(formatClock(c?.start ?? 0)).toBe('22:00');
    expect(formatClock(c?.end ?? 0)).toBe('06:00');
  });

  it('is consistent with shiftOf (round trip over a whole day)', () => {
    for (const s of shifts) {
      const bounds = shiftBounds('2026-10-24', s.id, shifts, DAY_START);
      expect(bounds).not.toBeNull();
      if (!bounds) continue;
      const first = shiftOf(bounds.start, shifts, DAY_START);
      const last = shiftOf(new Date(bounds.end.getTime() - 1000), shifts, DAY_START);
      expect([first?.id, first?.businessDay]).toEqual([s.id, '2026-10-24']);
      expect([last?.id, last?.businessDay]).toEqual([s.id, '2026-10-24']);
      expect(shiftOf(bounds.end, shifts, DAY_START)?.id).not.toBe(s.id);
    }
  });

  it('starts an early-morning shift on the next calendar day', () => {
    const early: ShiftWindow[] = [{ id: 'N', start: '02:00', end: '06:00' }];
    const n = shiftBounds('2026-10-24', 'N', early, DAY_START);
    expect(iso(n?.start)).toBe('2026-10-24T20:00:00.000Z'); // 02:00 on the 25th, Dhaka
  });

  it('returns null for an unknown shift id', () => {
    expect(shiftBounds('2026-10-24', 'Z', shifts, DAY_START)).toBeNull();
  });
});

describe('secondsSince', () => {
  it('measures elapsed seconds with fractions', () => {
    expect(secondsSince('2026-10-24T14:00:00+06:00', '2026-10-24T19:50:45.120+06:00')).toBeCloseTo(
      21045.12,
      3,
    );
  });

  it('mixes offsets and UTC', () => {
    expect(secondsSince('2026-10-24T08:00:00Z', '2026-10-24T14:00:10+06:00')).toBe(10);
  });

  it('is negative for the future and defaults now to the clock', () => {
    expect(secondsSince('2026-10-24T14:00:10+06:00', '2026-10-24T14:00:00+06:00')).toBe(-10);
    expect(Math.abs(secondsSince(new Date()))).toBeLessThan(2);
  });
});
