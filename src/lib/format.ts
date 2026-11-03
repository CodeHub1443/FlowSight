import type { Lang, UiLang } from '../domain/types';

// Locale-aware formatting. Pure functions; Intl does the work (Indian lakh/crore grouping in both digit modes).

export type DigitMode = 'latin' | 'bangla';

export type NumberFormatOptions = {
  lang: UiLang;
  digits: DigitMode;
  /** Fixed number of fraction digits (default 0). */
  fractionDigits?: number;
};

const formatters = new Map<string, Intl.NumberFormat>();

function numberFormat(
  lang: UiLang,
  digits: DigitMode,
  fractionDigits: number,
  signed: boolean,
  grouping: boolean,
  minInt = 1,
): Intl.NumberFormat {
  const key = `${lang}|${digits}|${fractionDigits}|${signed}|${grouping}|${minInt}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(lang === 'bn' ? 'bn-BD' : 'en-IN', {
      numberingSystem: digits === 'bangla' ? 'beng' : 'latn',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
      minimumIntegerDigits: minInt,
      useGrouping: grouping,
      signDisplay: signed ? 'exceptZero' : 'auto',
    });
    formatters.set(key, f);
  }
  return f;
}

const BANGLA_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

/** Replace ASCII digits with Bangla digits. */
export function toBanglaDigits(text: string): string {
  return text.replace(/\d/g, (d) => BANGLA_DIGITS[Number(d)] ?? d);
}

/** 1234567 -> "12,34,567" (latin) or "১২,৩৪,৫৬৭" (bangla). Non-finite input renders as an em dash. */
export function formatNumber(n: number, opts: NumberFormatOptions): string {
  if (!Number.isFinite(n)) return '—';
  return numberFormat(opts.lang, opts.digits, opts.fractionDigits ?? 0, false, true).format(n);
}

/** `pct` is in percent points (91 -> "91%"), like every *Pct field in the contract. `signed` adds +/-. */
export function formatPercent(
  pct: number,
  opts: NumberFormatOptions & { signed?: boolean },
): string {
  if (!Number.isFinite(pct)) return '—';
  const text = numberFormat(
    opts.lang,
    opts.digits,
    opts.fractionDigits ?? 0,
    opts.signed ?? false,
    true,
  ).format(pct);
  return `${text}%`;
}

const DURATION_UNITS: Record<UiLang, { h: string; m: string }> = {
  en: { h: 'h', m: 'm' },
  bn: { h: 'ঘ', m: 'মি' },
};

/**
 * Elapsed time, truncated to whole minutes: 3900 -> "1h 05m" / "১ ঘ ০৫ মি", 2700 -> "45m" / "৪৫ মি", under a minute -> "0m".
 * Digits follow the language unless `digits` is given (the number-system toggle).
 */
export function formatDuration(sec: number, lang: UiLang, digits?: DigitMode): string {
  const mode: DigitMode = digits ?? (lang === 'bn' ? 'bangla' : 'latin');
  const totalMin = Number.isFinite(sec) && sec > 0 ? Math.floor(sec / 60) : 0;
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  const units = DURATION_UNITS[lang];
  const plain = (n: number, minInt = 1) =>
    numberFormat(lang, mode, 0, false, false, minInt).format(n);
  if (hours === 0) return `${plain(minutes)}${lang === 'bn' ? ' ' : ''}${units.m}`;
  const sep = lang === 'bn' ? ' ' : '';
  return `${plain(hours)}${sep}${units.h} ${plain(minutes, 2)}${sep}${units.m}`;
}

/**
 * Minutes as hours and minutes, rounded to the nearest whole minute: 65 -> "1h 05m" / "১ ঘ ০৫ মি", 44.6 -> "45m".
 * For averages and timeline spans (an elapsed counter that must not run ahead should floor before calling).
 * `null`, `undefined` or a non-finite value -> "—" (temporarily unknown); negative -> "0m".
 */
export function formatDurationMin(
  min: number | null | undefined,
  lang: UiLang,
  digits?: DigitMode,
): string {
  if (min === null || min === undefined || !Number.isFinite(min)) return '—';
  return formatDuration(Math.max(0, Math.round(min)) * 60, lang, digits);
}

export type PlateText = { bn: string; en: string };

/**
 * Licence plate for display: Bangla primary, English secondary (CLAUDE.md, docs/01 section 7). The order does not
 * depend on the UI language, so there is no language parameter. A blank side falls back to the other one.
 */
export function formatPlate(plate: PlateText): { primary: string; secondary: string | null } {
  const bn = plate.bn.trim();
  const en = plate.en.trim();
  const primary = bn || en;
  const secondary = bn && en ? en : null;
  return { primary, secondary };
}

/** Pick the string for the UI language from a { en, bn } pair, falling back to the other when blank. */
export function formatLang(l: Lang, lang: UiLang): string {
  const preferred = l[lang];
  if (preferred.trim()) return preferred;
  return lang === 'bn' ? l.en : l.bn;
}
