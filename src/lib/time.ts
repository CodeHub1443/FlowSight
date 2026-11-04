import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';
import type { ShiftWindow } from '../domain/types';
import { toBanglaDigits, type DigitMode } from './format';

// Everything is Asia/Dhaka (no DST, fixed +06:00). Inputs are a Date, epoch ms or an ISO string with offset.

export const SITE_TZ = 'Asia/Dhaka';

export type TimeInput = Date | number | string;

const MS_MIN = 60_000;

function toDate(input: TimeInput): Date {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) throw new RangeError(`invalid time: ${String(input)}`);
  return d;
}

/**
 * A "zoned" Date whose local getters (getHours, getDate, ...) read as Dhaka wall-clock time (date-fns-tz idiom).
 * Use for display arithmetic only, never as an instant.
 */
export function toDhaka(input: TimeInput): Date {
  return toZonedTime(toDate(input), SITE_TZ);
}

/** "HH:mm" or "HH:mm:ss" in Dhaka time; Bangla digits with digits: 'bangla'. */
export function formatClock(
  input: TimeInput,
  opts: { seconds?: boolean; digits?: DigitMode } = {},
): string {
  const text = formatInTimeZone(toDate(input), SITE_TZ, opts.seconds ? 'HH:mm:ss' : 'HH:mm');
  return opts.digits === 'bangla' ? toBanglaDigits(text) : text;
}

function parseHHmm(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function localDate(input: TimeInput): string {
  return formatInTimeZone(toDate(input), SITE_TZ, 'yyyy-MM-dd');
}

function localMinutes(input: TimeInput): number {
  return parseHHmm(formatInTimeZone(toDate(input), SITE_TZ, 'HH:mm'));
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10);
}

function instantAt(date: string, minutes: number): Date {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return fromZonedTime(`${date}T${hh}:${mm}:00`, SITE_TZ);
}

/** Business day ("yyyy-MM-dd") an instant belongs to: the day starts at businessDayStart, not midnight. */
export function businessDayOf(input: TimeInput, businessDayStart: string): string {
  const date = localDate(input);
  return localMinutes(input) < parseHHmm(businessDayStart) ? addDays(date, -1) : date;
}

/** The instant a business day ("yyyy-MM-dd") starts, `days` business days later (negative: earlier). */
export function businessDayStart(date: string, businessDayStart: string, days = 0): Date {
  return instantAt(addDays(date, days), parseHHmm(businessDayStart));
}

export type ShiftInstance = { id: string; businessDay: string; start: Date; end: Date };

function durationMin(shift: ShiftWindow): number {
  const span = (parseHHmm(shift.end) - parseHHmm(shift.start) + 1440) % 1440;
  return span === 0 ? 1440 : span;
}

function instanceStartingOn(
  shift: ShiftWindow,
  date: string,
  businessDayStart: string,
): ShiftInstance {
  const start = instantAt(date, parseHHmm(shift.start));
  const end = new Date(start.getTime() + durationMin(shift) * MS_MIN);
  return { id: shift.id, businessDay: businessDayOf(start, businessDayStart), start, end };
}

/**
 * The shift running at an instant, or null if the config leaves a gap. Overnight shifts (C 22:00-06:00) cross
 * midnight and belong to the business day in which they started.
 */
export function shiftOf(
  input: TimeInput,
  shifts: readonly ShiftWindow[],
  businessDayStart: string,
): ShiftInstance | null {
  const t = toDate(input).getTime();
  const today = localDate(input);
  for (const shift of shifts) {
    for (const date of [addDays(today, -1), today]) {
      const inst = instanceStartingOn(shift, date, businessDayStart);
      if (inst.start.getTime() <= t && t < inst.end.getTime()) return inst;
    }
  }
  return null;
}

/** Start and end instants of a shift on a business day ("yyyy-MM-dd"), or null for an unknown shift id. */
export function shiftBounds(
  date: string,
  shiftId: string,
  shifts: readonly ShiftWindow[],
  businessDayStart: string,
): { start: Date; end: Date } | null {
  const shift = shifts.find((s) => s.id === shiftId);
  if (!shift) return null;
  // A shift that starts before the business-day start (e.g. 02:00 with a 06:00 day start) begins on the next calendar day.
  const startDate = parseHHmm(shift.start) < parseHHmm(businessDayStart) ? addDays(date, 1) : date;
  const { start, end } = instanceStartingOn(shift, startDate, businessDayStart);
  return { start, end };
}

/** Seconds from an instant until now (fractional; negative if the instant is in the future). */
export function secondsSince(input: TimeInput, now: TimeInput = Date.now()): number {
  return (toDate(now).getTime() - toDate(input).getTime()) / 1000;
}
