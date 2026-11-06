import { useMemo } from 'react';
import type { WhEventWithStatus } from '@/domain';
import { useFmt } from '@/features/live/useFmt';
import { formatLang, toBanglaDigits } from '@/lib/format';
import { SITE_TZ } from '@/lib/time';

/** Unknown / not yet available. A value that cannot be measured is hidden instead (CLAUDE.md, metric admission rule). */
export const DASH = '—';

const cache = new Map<string, Intl.DateTimeFormat>();
function dateFormat(lang: 'en' | 'bn', withTime: boolean): Intl.DateTimeFormat {
  const key = `${lang}|${withTime}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', {
      timeZone: SITE_TZ,
      weekday: withTime ? undefined : 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: withTime ? '2-digit' : undefined,
      minute: withTime ? '2-digit' : undefined,
      hourCycle: withTime ? 'h23' : undefined,
      numberingSystem: lang === 'bn' ? 'beng' : 'latn',
    });
    cache.set(key, f);
  }
  return f;
}

/** Report formatters: the shared number and duration helpers plus Dhaka dates ("Thu 6 Nov 2026", "6 Nov 2026, 14:05"). */
export function useReportFmt() {
  const fmt = useFmt();
  return useMemo(
    () => ({
      ...fmt,
      /** A business day ("yyyy-MM-dd") as a weekday and date. */
      day: (date: string) =>
        dateFormat(fmt.lang, false).format(Date.parse(`${date}T12:00:00+06:00`)),
      /** An instant as a date and a 24 h clock in Asia/Dhaka. */
      stamp: (t: number) => dateFormat(fmt.lang, true).format(t),
      dash: DASH,
      /** A configured "HH:mm" wall-clock string (shift hours) in the UI digits. */
      hhmm: (s: string) => (fmt.lang === 'bn' ? toBanglaDigits(s) : s),
      /** Signed whole number: "+4", "-4", "0". */
      sInt: (n: number) => fmt.signed(Math.round(n), 0),
    }),
    [fmt],
  );
}

export type ReportFmt = ReturnType<typeof useReportFmt>;

/** Title of an event in the UI language (thumbnail card and handover list). */
export function useEventTitle() {
  const { lang } = useReportFmt();
  return (e: Pick<WhEventWithStatus, 'title'>) => formatLang(e.title, lang);
}
