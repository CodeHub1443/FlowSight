import { describe, expect, it } from 'vitest';
import { DEFAULT_SITE } from '@/features/live/siteInfo';
import {
  addDaysIso,
  chipOf,
  currentShift,
  defaultPeriod,
  periodBounds,
  periodFromParams,
  periodToParams,
  previousPeriod,
  previousShiftOf,
  todayOf,
} from './period';

const site = DEFAULT_SITE; // business day from 06:00; shifts A 06-14, B 14-22, C 22-06
const at = (iso: string) => Date.parse(iso);
const B_NOW = at('2026-10-24T19:20:00+06:00');
const C_NOW = at('2026-10-25T02:00:00+06:00'); // overnight: still business day 10-24

describe('shift periods', () => {
  it('current shift', () => {
    expect(currentShift(B_NOW, site)).toEqual({ date: '2026-10-24', shift: 'B' });
    expect(currentShift(C_NOW, site)).toEqual({ date: '2026-10-24', shift: 'C' });
  });
  it('previous shift is the one before, across the overnight shift and the day start', () => {
    expect(previousShiftOf(B_NOW, site)).toEqual({ date: '2026-10-24', shift: 'A' });
    expect(previousShiftOf(C_NOW, site)).toEqual({ date: '2026-10-24', shift: 'B' });
    expect(previousShiftOf(at('2026-10-24T07:00:00+06:00'), site)).toEqual({
      date: '2026-10-23',
      shift: 'C',
    });
  });
  it('bounds of the overnight shift end the next morning', () => {
    const b = periodBounds('shift', { date: '2026-10-24', shift: 'C' }, site);
    expect(b).toEqual({
      start: at('2026-10-24T22:00:00+06:00'),
      end: at('2026-10-25T06:00:00+06:00'),
    });
    expect(periodBounds('shift', { date: '2026-10-24', shift: 'Z' }, site)).toBeNull();
  });
  it('the previous period of a shift is the shift before it', () => {
    expect(previousPeriod('shift', { date: '2026-10-24', shift: 'A' }, site)).toEqual({
      date: '2026-10-23',
      shift: 'C',
    });
    expect(previousPeriod('shift', { date: '2026-10-24', shift: 'Z' }, site)).toBeNull();
  });
});

describe('daily periods', () => {
  it('today follows the 06:00 business-day start', () => {
    expect(todayOf(at('2026-10-25T02:00:00+06:00'), site)).toBe('2026-10-24');
    expect(todayOf(at('2026-10-25T06:00:00+06:00'), site)).toBe('2026-10-25');
  });
  it('bounds are 06:00 to 06:00 and the previous period is the day before', () => {
    expect(periodBounds('daily', { date: '2026-10-24' }, site)).toEqual({
      start: at('2026-10-24T06:00:00+06:00'),
      end: at('2026-10-25T06:00:00+06:00'),
    });
    expect(previousPeriod('daily', { date: '2026-11-01' }, site)).toEqual({ date: '2026-10-31' });
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('defaults and chips', () => {
  it('defaults to the current shift and to today', () => {
    expect(defaultPeriod('shift', B_NOW, site)).toEqual({ date: '2026-10-24', shift: 'B' });
    expect(defaultPeriod('daily', B_NOW, site)).toEqual({ date: '2026-10-24' });
  });
  it('names the chip a period belongs to', () => {
    expect(chipOf('shift', { date: '2026-10-24', shift: 'B' }, B_NOW, site)).toBe('current');
    expect(chipOf('shift', { date: '2026-10-24', shift: 'A' }, B_NOW, site)).toBe('previous');
    expect(chipOf('shift', { date: '2026-10-23', shift: 'A' }, B_NOW, site)).toBe('pick');
    expect(chipOf('daily', { date: '2026-10-24' }, B_NOW, site)).toBe('current');
    expect(chipOf('daily', { date: '2026-10-23' }, B_NOW, site)).toBe('previous');
    expect(chipOf('daily', { date: '2026-10-01' }, B_NOW, site)).toBe('pick');
  });
});

describe('URL state', () => {
  const parse = (q: string) => periodFromParams(new URLSearchParams(q), B_NOW, site);
  it('reads kind, date and shift', () => {
    expect(parse('')).toEqual({ kind: 'shift', period: { date: '2026-10-24', shift: 'B' } });
    expect(parse('kind=daily&date=2026-10-20')).toEqual({
      kind: 'daily',
      period: { date: '2026-10-20' },
    });
    expect(parse('date=2026-10-20&shift=C')).toEqual({
      kind: 'shift',
      period: { date: '2026-10-20', shift: 'C' },
    });
  });
  it('drops a bad date, an unknown shift or a missing half, falling back to the default', () => {
    expect(parse('date=nope&shift=A').period).toEqual({ date: '2026-10-24', shift: 'B' });
    expect(parse('date=2026-10-20&shift=Z').period).toEqual({ date: '2026-10-24', shift: 'B' });
    expect(parse('date=2026-10-20').period).toEqual({ date: '2026-10-24', shift: 'B' });
    expect(parse('kind=weird').kind).toBe('shift');
    expect(parse('kind=daily&date=2026-13-45').period).toEqual({ date: '2026-10-24' });
  });
  it('serialises the default period to a bare URL and round-trips the rest', () => {
    const q = (kind: 'shift' | 'daily', p: { date: string; shift?: string }) =>
      periodToParams(kind, p, B_NOW, site).toString();
    expect(q('shift', { date: '2026-10-24', shift: 'B' })).toBe('');
    expect(q('daily', { date: '2026-10-24' })).toBe('kind=daily');
    expect(q('shift', { date: '2026-10-23', shift: 'C' })).toBe('date=2026-10-23&shift=C');
    expect(q('daily', { date: '2026-10-20' })).toBe('kind=daily&date=2026-10-20');
    for (const [kind, p] of [
      ['shift', { date: '2026-10-23', shift: 'C' }],
      ['daily', { date: '2026-10-20' }],
    ] as const) {
      expect(periodFromParams(periodToParams(kind, p, B_NOW, site), B_NOW, site)).toEqual({
        kind,
        period: p,
      });
    }
  });
});
