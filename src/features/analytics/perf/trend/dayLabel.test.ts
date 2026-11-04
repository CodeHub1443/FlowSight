import { describe, expect, it } from 'vitest';
import { formatDayLabel } from './dayLabel';

// 2026-10-24 is a Saturday; the business day starts 06:00 Dhaka, which is still the 24th in Asia/Dhaka
const T = Date.parse('2026-10-24T06:00:00+06:00');

describe('formatDayLabel', () => {
  it('English, Latin digits, Dhaka date', () => {
    expect(formatDayLabel(T, 'en', 'latin')).toBe('Sat 24 Oct');
  });
  it('uses the Dhaka date, not the UTC one', () => {
    // 01:00 Dhaka on the 25th is still the 24th in UTC
    expect(formatDayLabel(Date.parse('2026-10-25T01:00:00+06:00'), 'en', 'latin')).toBe(
      'Sun 25 Oct',
    );
  });
  it('Bangla, Bangla digits only', () => {
    const s = formatDayLabel(T, 'bn', 'bangla');
    expect(s).toMatch(/২৪/);
    expect(s).not.toMatch(/[0-9]/);
  });
});
