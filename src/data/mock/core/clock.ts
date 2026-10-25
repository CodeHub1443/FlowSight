import type { ShiftWindow } from '@/domain';

// Fast Asia/Dhaka helpers for the simulator hot path. Dhaka has no DST (fixed +06:00), so plain integer
// arithmetic is exact; src/lib/time.ts (date-fns-tz) stays the reference and a test compares the two.

export const SEC = 1000;
export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;
export const TZ_OFFSET = 6 * HOUR;

/** ISO-8601 with the +06:00 offset and millisecond precision. */
export function iso(ms: number): string {
  return new Date(ms + TZ_OFFSET).toISOString().slice(0, 23) + '+06:00';
}

/** Dhaka calendar date, yyyy-MM-dd. */
export function dateOf(ms: number): string {
  return new Date(ms + TZ_OFFSET).toISOString().slice(0, 10);
}

/** Epoch ms of Dhaka midnight on the calendar day containing `ms`. */
export function localMidnight(ms: number): number {
  return Math.floor((ms + TZ_OFFSET) / DAY) * DAY - TZ_OFFSET;
}

export function minuteOfDay(ms: number): number {
  return Math.floor((ms + TZ_OFFSET - Math.floor((ms + TZ_OFFSET) / DAY) * DAY) / MIN);
}

export function hourOfDay(ms: number): number {
  return Math.floor(minuteOfDay(ms) / 60);
}

export function parseHHmm(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Epoch ms for a Dhaka wall-clock date ("yyyy-MM-dd") and "HH:mm". */
export function at(date: string, hhmm: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) + parseHHmm(hhmm) * MIN - TZ_OFFSET;
}

export type ShiftSlot = { id: string; start: number; end: number; businessDay: string };

/** Shift and business-day lookup from config (shifts + businessDayStart), cached per shift instance. */
export class ShiftClock {
  private cache: ShiftSlot | null = null;
  private readonly bizStartMin: number;

  constructor(
    private readonly shifts: readonly ShiftWindow[],
    businessDayStart: string,
  ) {
    this.bizStartMin = parseHHmm(businessDayStart);
  }

  businessDay(ms: number): string {
    return minuteOfDay(ms) < this.bizStartMin ? dateOf(ms - DAY) : dateOf(ms);
  }

  /** Start of the business day that `ms` belongs to. */
  businessDayStart(ms: number): number {
    return (
      localMidnight(ms - (minuteOfDay(ms) < this.bizStartMin ? DAY : 0)) + this.bizStartMin * MIN
    );
  }

  at(ms: number): ShiftSlot {
    const c = this.cache;
    if (c && ms >= c.start && ms < c.end) return c;
    const m0 = localMidnight(ms);
    for (const dayOffset of [-1, 0]) {
      for (const s of this.shifts) {
        const startMin = parseHHmm(s.start);
        const span = (parseHHmm(s.end) - startMin + 1440) % 1440 || 1440;
        const start = m0 + dayOffset * DAY + startMin * MIN;
        const end = start + span * MIN;
        if (start <= ms && ms < end) {
          this.cache = { id: s.id, start, end, businessDay: this.businessDay(start) };
          return this.cache;
        }
      }
    }
    throw new Error(`no shift covers ${iso(ms)}`);
  }

  /** Start of the latest shift that begins at or before `ms`. */
  shiftStartAtOrBefore(ms: number): number {
    return this.at(ms).start;
  }
}
