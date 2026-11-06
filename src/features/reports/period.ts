import type { ReportKind } from '@/data/api/endpoints';
import type { ReportPeriod } from '@/data/api/reportQueries';
import type { SiteConfig } from '@/domain';
import { businessDayOf, businessDayStart, shiftBounds, shiftOf } from '@/lib/time';

// Pure period helpers for /reports. Everything comes from the site calendar (business-day start and shifts), Asia/Dhaka.

export type SiteCal = Pick<SiteConfig, 'businessDayStart' | 'shiftsPlaceholder'>;

export const REPORT_KINDS = ['shift', 'daily'] as const;

export function parseKind(raw: string | null | undefined): ReportKind {
  return raw === 'daily' ? 'daily' : 'shift';
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (s: string | null | undefined): s is string =>
  typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10);
}

export interface PeriodBounds {
  start: number;
  end: number;
}

/** [start, end) of a period in epoch ms, or null for a shift id the site does not have. */
export function periodBounds(
  kind: ReportKind,
  p: ReportPeriod,
  site: SiteCal,
): PeriodBounds | null {
  if (kind === 'daily') {
    return {
      start: businessDayStart(p.date, site.businessDayStart).getTime(),
      end: businessDayStart(p.date, site.businessDayStart, 1).getTime(),
    };
  }
  const b = p.shift
    ? shiftBounds(p.date, p.shift, site.shiftsPlaceholder, site.businessDayStart)
    : null;
  return b ? { start: b.start.getTime(), end: b.end.getTime() } : null;
}

/** The latest shift instance that ended at or before `ref`, or null. */
function shiftEndingBefore(ref: number, site: SiteCal): (ReportPeriod & PeriodBounds) | null {
  const today = businessDayOf(ref, site.businessDayStart);
  let best: (ReportPeriod & PeriodBounds) | null = null;
  for (const offset of [-2, -1, 0, 1]) {
    const date = addDaysIso(today, offset);
    for (const s of site.shiftsPlaceholder) {
      const b = shiftBounds(date, s.id, site.shiftsPlaceholder, site.businessDayStart);
      if (!b) continue;
      const end = b.end.getTime();
      if (end <= ref && (!best || end > best.end)) {
        best = { date, shift: s.id, start: b.start.getTime(), end };
      }
    }
  }
  return best;
}

/** The shift running at `now`; null in a gap between configured shifts. */
export function currentShift(now: number, site: SiteCal): ReportPeriod | null {
  const inst = shiftOf(now, site.shiftsPlaceholder, site.businessDayStart);
  return inst ? { date: inst.businessDay, shift: inst.id } : null;
}

/** The most recent shift that has finished (the one before the current shift, or before `now` in a gap). */
export function previousShiftOf(now: number, site: SiteCal): ReportPeriod | null {
  const inst = shiftOf(now, site.shiftsPlaceholder, site.businessDayStart);
  const hit = shiftEndingBefore(inst ? inst.start.getTime() : now, site);
  return hit ? { date: hit.date, shift: hit.shift } : null;
}

export const todayOf = (now: number, site: SiteCal): string =>
  businessDayOf(now, site.businessDayStart);

/** The period of the same kind immediately before `p` (for deltas); null if it cannot be derived. */
export function previousPeriod(
  kind: ReportKind,
  p: ReportPeriod,
  site: SiteCal,
): ReportPeriod | null {
  if (kind === 'daily') return { date: addDaysIso(p.date, -1) };
  const b = periodBounds('shift', p, site);
  if (!b) return null;
  const hit = shiftEndingBefore(b.start, site);
  return hit ? { date: hit.date, shift: hit.shift } : null;
}

/** The default period for a kind: the current shift (or the last finished one in a gap) / today. */
export function defaultPeriod(kind: ReportKind, now: number, site: SiteCal): ReportPeriod {
  if (kind === 'daily') return { date: todayOf(now, site) };
  return (
    currentShift(now, site) ??
    previousShiftOf(now, site) ?? {
      date: todayOf(now, site),
      shift: site.shiftsPlaceholder[0]?.id,
    }
  );
}

export type ReportChip = 'current' | 'previous' | 'pick';

/** Which chip a period corresponds to (the date picker is "pick" when neither preset matches). */
export function chipOf(kind: ReportKind, p: ReportPeriod, now: number, site: SiteCal): ReportChip {
  if (kind === 'daily') {
    const today = todayOf(now, site);
    if (p.date === today) return 'current';
    return p.date === addDaysIso(today, -1) ? 'previous' : 'pick';
  }
  const cur = currentShift(now, site);
  if (cur && cur.date === p.date && cur.shift === p.shift) return 'current';
  const prev = previousShiftOf(now, site);
  return prev && prev.date === p.date && prev.shift === p.shift ? 'previous' : 'pick';
}

/**
 * Read the period from URL params (`kind`, `date`, `shift`), falling back to the default for the kind.
 * An unknown shift id or a malformed date is dropped, so a bad link never produces a request.
 */
export function periodFromParams(
  params: URLSearchParams,
  now: number,
  site: SiteCal,
): { kind: ReportKind; period: ReportPeriod } {
  const kind = parseKind(params.get('kind'));
  const fallback = defaultPeriod(kind, now, site);
  const rawDate = params.get('date');
  const date = isIsoDate(rawDate) ? rawDate : null;
  if (kind === 'daily') return { kind, period: { date: date ?? fallback.date } };
  const rawShift = params.get('shift');
  const shift = site.shiftsPlaceholder.find((s) => s.id === rawShift)?.id;
  if (date && shift) return { kind, period: { date, shift } };
  return { kind, period: fallback };
}

/** Inverse of periodFromParams: the default period for a kind serialises to just `kind`. */
export function periodToParams(
  kind: ReportKind,
  p: ReportPeriod,
  now: number,
  site: SiteCal,
): URLSearchParams {
  const out = new URLSearchParams();
  if (kind === 'daily') out.set('kind', 'daily');
  if (chipOf(kind, p, now, site) === 'current' && kind === 'shift') return out;
  if (kind === 'daily' && p.date === todayOf(now, site)) return out;
  out.set('date', p.date);
  if (kind === 'shift' && p.shift) out.set('shift', p.shift);
  return out;
}
