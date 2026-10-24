// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  formatLang,
  formatNumber,
  formatPercent,
  formatPlate,
  toBanglaDigits,
} from './format';

const en = { lang: 'en', digits: 'latin' } as const;
const bnBn = { lang: 'bn', digits: 'bangla' } as const;
const enBangla = { lang: 'en', digits: 'bangla' } as const;
const bnLatin = { lang: 'bn', digits: 'latin' } as const;

describe('formatNumber', () => {
  it('groups in lakh/crore (Indian) style in latin digits', () => {
    expect(formatNumber(0, en)).toBe('0');
    expect(formatNumber(999, en)).toBe('999');
    expect(formatNumber(1000, en)).toBe('1,000');
    expect(formatNumber(18240, en)).toBe('18,240');
    expect(formatNumber(100000, en)).toBe('1,00,000');
    expect(formatNumber(1234567, en)).toBe('12,34,567');
    expect(formatNumber(123456789, en)).toBe('12,34,56,789');
  });

  it('groups the same way in Bangla digits', () => {
    expect(formatNumber(0, bnBn)).toBe('০');
    expect(formatNumber(18240, bnBn)).toBe('১৮,২৪০');
    expect(formatNumber(100000, bnBn)).toBe('১,০০,০০০');
    expect(formatNumber(1234567, bnBn)).toBe('১২,৩৪,৫৬৭');
    expect(formatNumber(1234567, enBangla)).toBe('১২,৩৪,৫৬৭');
  });

  it('keeps latin digits with Indian grouping when the language is Bangla', () => {
    expect(formatNumber(1234567, bnLatin)).toBe('12,34,567');
  });

  it('handles negatives, decimals and rounding', () => {
    expect(formatNumber(-1234567, en)).toBe('-12,34,567');
    expect(formatNumber(14.2, { ...en, fractionDigits: 1 })).toBe('14.2');
    expect(formatNumber(14.2, { ...bnBn, fractionDigits: 1 })).toBe('১৪.২');
    expect(formatNumber(1234.5, { ...en, fractionDigits: 2 })).toBe('1,234.50');
    expect(formatNumber(2.5, en)).toBe('3');
  });

  it('renders non-finite values as a dash', () => {
    expect(formatNumber(NaN, en)).toBe('—');
    expect(formatNumber(Infinity, bnBn)).toBe('—');
  });
});

describe('formatPercent', () => {
  it('takes percent points', () => {
    expect(formatPercent(91, en)).toBe('91%');
    expect(formatPercent(91, bnBn)).toBe('৯১%');
    expect(formatPercent(6.2, { ...en, fractionDigits: 1 })).toBe('6.2%');
    expect(formatPercent(100, en)).toBe('100%');
  });

  it('can show an explicit sign for deltas', () => {
    expect(formatPercent(6.2, { ...en, fractionDigits: 1, signed: true })).toBe('+6.2%');
    expect(formatPercent(-3.1, { ...en, fractionDigits: 1, signed: true })).toBe('-3.1%');
    expect(formatPercent(0, { ...en, signed: true })).toBe('0%');
  });
});

describe('formatDuration', () => {
  it('formats hours and padded minutes', () => {
    expect(formatDuration(3900, 'en')).toBe('1h 05m');
    expect(formatDuration(3900, 'bn')).toBe('১ ঘ ০৫ মি');
    expect(formatDuration(7200, 'en')).toBe('2h 00m');
    expect(formatDuration(7200, 'bn')).toBe('২ ঘ ০০ মি');
  });

  it('formats minutes only under an hour', () => {
    expect(formatDuration(2700, 'en')).toBe('45m');
    expect(formatDuration(2700, 'bn')).toBe('৪৫ মি');
    expect(formatDuration(60, 'en')).toBe('1m');
    expect(formatDuration(3599, 'en')).toBe('59m');
  });

  it('formats zero and sub-minute as 0m', () => {
    expect(formatDuration(0, 'en')).toBe('0m');
    expect(formatDuration(0, 'bn')).toBe('০ মি');
    expect(formatDuration(59, 'en')).toBe('0m');
  });

  it('clamps negative and non-finite input to 0m', () => {
    expect(formatDuration(-120, 'en')).toBe('0m');
    expect(formatDuration(NaN, 'en')).toBe('0m');
  });

  it('does not group long durations and honours the digit toggle', () => {
    expect(formatDuration(125 * 3600 + 300, 'en')).toBe('125h 05m');
    expect(formatDuration(3900, 'bn', 'latin')).toBe('1 ঘ 05 মি');
    expect(formatDuration(3900, 'en', 'bangla')).toBe('১h ০৫m');
  });
});

describe('formatPlate', () => {
  const plate = { bn: 'ঢাকা মেট্রো-ড ১১-২১৭১', en: 'DHAKA METRO-DA 11-2171' };

  it('puts Bangla first and English second', () => {
    expect(formatPlate(plate)).toEqual({ primary: plate.bn, secondary: plate.en });
  });

  it('falls back when one side is blank', () => {
    expect(formatPlate({ bn: '', en: plate.en })).toEqual({ primary: plate.en, secondary: null });
    expect(formatPlate({ bn: plate.bn, en: ' ' })).toEqual({ primary: plate.bn, secondary: null });
  });
});

describe('formatLang', () => {
  it('picks the UI language', () => {
    expect(formatLang({ en: 'Bay 1', bn: 'বে ১' }, 'en')).toBe('Bay 1');
    expect(formatLang({ en: 'Bay 1', bn: 'বে ১' }, 'bn')).toBe('বে ১');
  });

  it('falls back to the other language when blank', () => {
    expect(formatLang({ en: 'Bay 1', bn: '' }, 'bn')).toBe('Bay 1');
    expect(formatLang({ en: ' ', bn: 'বে ১' }, 'en')).toBe('বে ১');
  });
});

describe('toBanglaDigits', () => {
  it('converts only digits', () => {
    expect(toBanglaDigits('19:50:45')).toBe('১৯:৫০:৪৫');
    expect(toBanglaDigits('ঢাকা A1')).toBe('ঢাকা A১');
  });
});
