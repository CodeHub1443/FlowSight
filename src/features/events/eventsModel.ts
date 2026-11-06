import type { EventStatus, Role, WhEventWithStatus } from '@/domain';
import { canViewCategory } from '@/lib/rbac';
import { matchesAlertGroup } from '@/features/live/kpiDetail/selectors';
import { calendarOf, dataNow } from '@/data/api/queries';
import { DEFAULT_SITE } from '@/features/live/siteInfo';
import { periodWindow } from '@/lib/period';
import { defaultEventFilters, type EventFilters } from './urlState';

// Pure helpers of the /events page: filtering, merge of live events, windowing and grouping. No React, no stores.

export const ROW_H = 48;
export const OVERSCAN = 6;

const RANK: Record<EventStatus, number> = { OPEN: 0, ACK: 1, CLOSED: 2 };

export interface WindowRange {
  /** First rendered row (inclusive). */
  start: number;
  /** Last rendered row (exclusive). */
  end: number;
  /** Height of the spacer above and below the rendered rows, px. */
  padTop: number;
  padBottom: number;
  totalHeight: number;
}

/** Hand-written windowing for fixed-height rows: the rows to render for a scroll position. */
export function windowRange(
  total: number,
  scrollTop: number,
  viewportH: number,
  rowH = ROW_H,
  overscan = OVERSCAN,
): WindowRange {
  const n = Math.max(0, total);
  const first = Math.floor(Math.max(0, scrollTop) / rowH);
  const visible = Math.ceil(Math.max(0, viewportH) / rowH);
  const start = Math.min(n, Math.max(0, first - overscan));
  const end = Math.min(n, first + visible + overscan);
  return {
    start,
    end: Math.max(start, end),
    padTop: start * rowH,
    padBottom: Math.max(0, n - Math.max(start, end)) * rowH,
    totalHeight: n * rowH,
  };
}

/** scrollTop that brings row `index` fully into view (unchanged when it already is). */
export function scrollToRow(
  index: number,
  scrollTop: number,
  viewportH: number,
  rowH = ROW_H,
): number {
  const top = index * rowH;
  if (top < scrollTop) return top;
  if (top + rowH > scrollTop + viewportH) return top + rowH - viewportH;
  return scrollTop;
}

/** Newest first; ties by id so the order is total and stable. */
export const byNewest = (a: WhEventWithStatus, b: WhEventWithStatus): number =>
  Date.parse(b.ts) - Date.parse(a.ts) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

const norm = (s: string) => s.toLocaleLowerCase();

/** Free text over title (both languages), plate and SKU. */
export function matchesText(e: WhEventWithStatus, q: string): boolean {
  const needle = norm(q.trim());
  if (needle === '') return true;
  return [e.title.en, e.title.bn, e.refs.plateEn ?? '', e.refs.sku ?? ''].some((s) =>
    norm(s).includes(needle),
  );
}

/** Client-side mirror of the server filters, for live events and for `group`. */
export function matchesFilters(e: WhEventWithStatus, f: EventFilters, role: Role): boolean {
  if (!canViewCategory(role, e.category)) return false;
  if (!f.status.includes(e.status)) return false;
  if (f.sev.length > 0 && !f.sev.includes(e.sev)) return false;
  if (f.category.length > 0 && !f.category.some((c) => c === e.category)) return false;
  if (f.bay.length > 0 && (e.bay === null || !f.bay.includes(e.bay))) return false;
  const t = Date.parse(e.ts);
  if (f.from !== null && t < f.from) return false;
  if (f.to !== null && t >= f.to) return false;
  if (f.group !== null && !matchesAlertGroup(e, f.group)) return false;
  return matchesText(e, f.q);
}

/** The more advanced copy of one event (status moves forward only; more notes win a tie). */
export function newer(a: WhEventWithStatus, b: WhEventWithStatus): WhEventWithStatus {
  if (RANK[a.status] !== RANK[b.status]) return RANK[a.status] > RANK[b.status] ? a : b;
  return b.notes.length > a.notes.length ? b : a;
}

export interface MergedRows {
  /** What the table shows, newest first. */
  rows: WhEventWithStatus[];
  /** Live events that match but are held back (the "N new" pill). */
  pending: WhEventWithStatus[];
}

/**
 * Fetched rows plus live open events, merged by id (no duplicates; the more advanced copy wins).
 * A live event that is not in the fetched pages and not in `baseline` (the ids the store held when the list loaded) is "new";
 * unless its id is in `applied` it is held in `pending`.
 * Fetched rows are always shown, with their status refreshed from the live copy.
 */
export function mergeRows(
  fetched: readonly WhEventWithStatus[],
  live: readonly WhEventWithStatus[],
  filters: EventFilters,
  role: Role,
  applied: ReadonlySet<string>,
  baseline: ReadonlySet<string> = new Set(),
): MergedRows {
  const liveById = new Map(live.map((e) => [e.id, e]));
  const out = new Map<string, WhEventWithStatus>();
  for (const e of fetched) {
    const l = liveById.get(e.id);
    // A row stays where it is when its status moves (no jumping rows); it is only refreshed.
    out.set(e.id, l ? newer(e, l) : e);
  }
  const pending: WhEventWithStatus[] = [];
  for (const l of live) {
    if (out.has(l.id) || !matchesFilters(l, { ...filters, group: null }, role)) continue;
    // Known when the list loaded but not on a page yet: an older row that paging will bring, not news.
    if (baseline.has(l.id)) continue;
    if (applied.has(l.id)) out.set(l.id, l);
    else pending.push(l);
  }
  const rows = [...out.values()]
    .filter((e) => filters.group === null || matchesAlertGroup(e, filters.group))
    .sort(byNewest);
  return { rows, pending: pending.sort(byNewest) };
}

export type TableRow =
  | { kind: 'event'; key: string; event: WhEventWithStatus; child: boolean }
  | {
      kind: 'group';
      key: string;
      visitId: string;
      /** Newest event of the truck. */
      head: WhEventWithStatus;
      count: number;
      worst: WhEventWithStatus['sev'];
      expanded: boolean;
    };

const SEV_RANK = { info: 0, warn: 1, critical: 2 } as const;

/**
 * "Group by truck": events of one visit become one group row at the place of the newest one; an expanded group lists its
 * events below it. Events without a visit stay plain rows. A visit with one event is not grouped.
 */
export function groupRows(
  rows: readonly WhEventWithStatus[],
  groupByVisit: boolean,
  expanded: ReadonlySet<string>,
): TableRow[] {
  if (!groupByVisit) {
    return rows.map((event) => ({ kind: 'event', key: event.id, event, child: false }));
  }
  const byVisit = new Map<string, WhEventWithStatus[]>();
  for (const e of rows) {
    const v = e.refs.visitId;
    if (v) byVisit.set(v, [...(byVisit.get(v) ?? []), e]);
  }
  const out: TableRow[] = [];
  const done = new Set<string>();
  for (const e of rows) {
    const v = e.refs.visitId;
    const members = v ? byVisit.get(v) : undefined;
    if (!v || !members || members.length < 2) {
      out.push({ kind: 'event', key: e.id, event: e, child: false });
      continue;
    }
    if (done.has(v)) continue;
    done.add(v);
    const open = expanded.has(v);
    out.push({
      kind: 'group',
      key: `visit:${v}`,
      visitId: v,
      head: e,
      count: members.length,
      worst: members.reduce<WhEventWithStatus['sev']>(
        (w, m) => (SEV_RANK[m.sev] > SEV_RANK[w] ? m.sev : w),
        'info',
      ),
      expanded: open,
    });
    if (open)
      for (const m of members) out.push({ kind: 'event', key: m.id, event: m, child: true });
  }
  return out;
}

/** True when an event can be acknowledged right now. */
export const canAck = (e: WhEventWithStatus): boolean => e.status === 'OPEN';

/** When CLOSED is part of the status filter and no range is set, the range defaults to today (t22 spec section 3). */
export function effectiveFilters(f: EventFilters, now = dataNow()): EventFilters {
  if (f.status.includes('CLOSED') && f.from === null && f.to === null) {
    return { ...f, from: periodWindow('day', now, calendarOf(DEFAULT_SITE)).start };
  }
  return f;
}

/** Filters equal the default view (nothing to clear). */
export function isDefaultFilters(f: EventFilters): boolean {
  const d = defaultEventFilters();
  return (
    f.status.join() === d.status.join() &&
    f.sev.length === 0 &&
    f.category.length === 0 &&
    f.bay.length === 0 &&
    f.q === '' &&
    f.from === null &&
    f.to === null &&
    f.group === null &&
    f.groupBy === null
  );
}
