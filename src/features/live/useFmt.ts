import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { UiLang } from '@/domain';
import { formatDuration, formatNumber, formatPercent, type DigitMode } from '@/lib/format';
import { formatClock } from '@/lib/time';

/** Language-aware formatters bound to the active UI language (Bangla digits in bn). All times are Asia/Dhaka. */
export function useFmt() {
  const { i18n } = useTranslation();
  const lang: UiLang = i18n.resolvedLanguage === 'bn' ? 'bn' : 'en';
  return useMemo(() => {
    const digits: DigitMode = lang === 'bn' ? 'bangla' : 'latin';
    return {
      lang,
      digits,
      num: (n: number, fractionDigits = 0) => formatNumber(n, { lang, digits, fractionDigits }),
      pct: (n: number, signed = false, fractionDigits = 0) =>
        formatPercent(n, { lang, digits, fractionDigits, signed }),
      /** Signed number, e.g. "+4" / "-4" (zero is unsigned). */
      signed: (n: number, fractionDigits = 0) =>
        `${n > 0 ? '+' : ''}${formatNumber(n, { lang, digits, fractionDigits })}`,
      dur: (sec: number) => formatDuration(sec, lang, digits),
      clock: (t: Date | number | string, seconds = false) => formatClock(t, { seconds, digits }),
      // One-argument formatters with a stable identity per language, for <Num format={...}>.
      int: (n: number) => formatNumber(n, { lang, digits, fractionDigits: 0 }),
      pctInt: (n: number) => formatPercent(n, { lang, digits, fractionDigits: 0, signed: false }),
      pctAbs1: (n: number) =>
        formatPercent(Math.abs(n), { lang, digits, fractionDigits: 1, signed: false }),
      durMin: (min: number) => formatDuration(min * 60, lang, digits),
    };
  }, [lang]);
}

export type Fmt = ReturnType<typeof useFmt>;
