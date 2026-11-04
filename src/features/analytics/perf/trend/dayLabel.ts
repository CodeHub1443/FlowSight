import type { UiLang } from '@/domain';
import type { DigitMode } from '@/lib/format';
import { SITE_TZ } from '@/lib/time';

// Day labels for the week view of W4 ("Sat 24 Oct" / "শনি ২৪ অক্টো"), always in Asia/Dhaka. The numbering system
// follows the digit mode, so Bangla digits come from Intl and not from string surgery.

const cache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(lang: UiLang, digits: DigitMode): Intl.DateTimeFormat {
  const key = `${lang}|${digits}`;
  let f = cache.get(key);
  if (!f) {
    const locale = lang === 'bn' ? 'bn-BD' : 'en-GB';
    f = new Intl.DateTimeFormat(`${locale}-u-nu-${digits === 'bangla' ? 'beng' : 'latn'}`, {
      timeZone: SITE_TZ,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    cache.set(key, f);
  }
  return f;
}

export function formatDayLabel(t: number, lang: UiLang, digits: DigitMode): string {
  return formatterFor(lang, digits).format(new Date(t));
}
