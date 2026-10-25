// @vitest-environment node
import { formatInTimeZone } from 'date-fns-tz';
import { describe, expect, it } from 'vitest';
import { businessDayOf, shiftOf } from '@/lib/time';
import { at, DAY, dateOf, iso, MIN, minuteOfDay, ShiftClock } from './clock';
import { CFG, PEAK } from './testing';

describe('fast Asia/Dhaka clock matches src/lib/time.ts', () => {
  const clock = new ShiftClock(CFG.shiftsPlaceholder, CFG.businessDayStart);
  // every 17 minutes across 3 days, including all three shift boundaries and the 06:00 business-day start
  const samples = Array.from({ length: 254 }, (_, i) => PEAK - DAY + i * 17 * MIN);

  it('formats ISO timestamps with the +06:00 offset', () => {
    for (const t of samples) {
      expect(iso(t)).toBe(formatInTimeZone(t, 'Asia/Dhaka', "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"));
      expect(dateOf(t)).toBe(formatInTimeZone(t, 'Asia/Dhaka', 'yyyy-MM-dd'));
    }
  });

  it('resolves business day and shift like the reference', () => {
    for (const t of samples) {
      expect(clock.businessDay(t)).toBe(businessDayOf(t, CFG.businessDayStart));
      const ref = shiftOf(t, CFG.shiftsPlaceholder, CFG.businessDayStart);
      const slot = clock.at(t);
      expect(slot.id).toBe(ref?.id);
      expect(slot.start).toBe(ref?.start.getTime());
      expect(slot.end).toBe(ref?.end.getTime());
      expect(slot.businessDay).toBe(ref?.businessDay);
    }
  });

  it('knows the start of the business day and wall-clock conversions', () => {
    expect(clock.businessDayStart(PEAK)).toBe(at('2026-10-24', '06:00'));
    expect(clock.businessDayStart(at('2026-10-25', '02:00'))).toBe(at('2026-10-24', '06:00'));
    expect(minuteOfDay(PEAK)).toBe(19 * 60 + 20);
    expect(clock.at(at('2026-10-24', '22:00')).id).toBe('C');
    expect(clock.at(at('2026-10-25', '05:59')).id).toBe('C');
    expect(clock.at(at('2026-10-25', '05:59')).businessDay).toBe('2026-10-24');
  });
});
