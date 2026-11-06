import {
  EventStatusSchema,
  SeveritySchema,
  type EventStatus,
  type Role,
  type Severity,
} from '@/domain';
import { ALERT_GROUP_IDS, type AlertGroupId } from '@/features/live/kpiDetail/selectors';
import { EVENT_CATEGORIES, canViewCategory, type EventCategory } from '@/lib/rbac';
import { isoDhaka } from '@/data/api/endpoints';

// URL state of /events (t22 spec section 2). Everything the page filters on lives in the query string so a view can be
// shared and survives a reload. Invalid parameters are ignored (never thrown); categories the role cannot view are dropped.
// Lists accept both `sev=warn,critical` and repeated `sev=warn&sev=critical`; they are written back comma-separated.

export const STATUS_ORDER: readonly EventStatus[] = EventStatusSchema.options;
export const SEVERITY_ORDER: readonly Severity[] = SeveritySchema.options;
/** Default view: everything not closed. */
export const DEFAULT_STATUSES: readonly EventStatus[] = ['OPEN', 'ACK'];

export interface EventFilters {
  /** Non-empty, canonical order. Default OPEN + ACK. */
  status: EventStatus[];
  sev: Severity[];
  category: EventCategory[];
  /** B01..B07, ascending. */
  bay: string[];
  /** Free text over title, plate and SKU. */
  q: string;
  /** Epoch ms, inclusive start; null = no bound. */
  from: number | null;
  /** Epoch ms, exclusive end; null = no bound. */
  to: number | null;
  /** One of ALERT_GROUPS ids ("Needs attention"); applied client-side with matchesAlertGroup. */
  group: AlertGroupId | null;
  /** Collapse hygiene volume per truck visit. */
  groupBy: 'visit' | null;
}

export const defaultEventFilters = (): EventFilters => ({
  status: [...DEFAULT_STATUSES],
  sev: [],
  category: [],
  bay: [],
  q: '',
  from: null,
  to: null,
  group: null,
  groupBy: null,
});

const MAX_Q = 100;
const BAY_RE = /^B\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function listOf(params: URLSearchParams, key: string): string[] {
  return params
    .getAll(key)
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter((v) => v !== '');
}

/** Keeps the known values of `order` that appear in `raw`: canonical order, no duplicates, unknown values ignored. */
function pick<T extends string>(raw: readonly string[], order: readonly T[]): T[] {
  const set = new Set(raw);
  return order.filter((v) => set.has(v));
}

function parseTime(raw: string | null): number | null {
  if (raw === null) return null;
  const s = raw.trim().replace(/ (\d{2}:\d{2})$/, '+$1'); // a "+" in an offset can arrive as a space
  const ms = DATE_RE.test(s) ? Date.parse(`${s}T00:00:00+06:00`) : Date.parse(s);
  return Number.isNaN(ms) ? null : ms;
}

/** Parse the query string. `role` drops categories the role cannot view (no role = no restriction). */
export function parseEventFilters(params: URLSearchParams, role?: Role): EventFilters {
  const f = defaultEventFilters();
  const status = pick(listOf(params, 'status'), STATUS_ORDER);
  if (status.length > 0) f.status = status;
  f.sev = pick(listOf(params, 'sev'), SEVERITY_ORDER);
  f.category = pick(listOf(params, 'category'), EVENT_CATEGORIES).filter(
    (c) => role === undefined || canViewCategory(role, c),
  );
  f.bay = [...new Set(listOf(params, 'bay').filter((b) => BAY_RE.test(b)))].sort();
  f.q = (params.get('q') ?? '').trim().slice(0, MAX_Q);
  f.from = parseTime(params.get('from'));
  f.to = parseTime(params.get('to'));
  if (f.from !== null && f.to !== null && f.from >= f.to) {
    f.from = null;
    f.to = null;
  }
  const group = params.get('group');
  f.group = ALERT_GROUP_IDS.find((g) => g === group) ?? null;
  f.groupBy = params.get('groupBy') === 'visit' ? 'visit' : null;
  return f;
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/** Query string without the "?"; defaults are omitted, so the default view is the empty string. */
export function serializeEventFilters(filters: EventFilters): string {
  const p = new URLSearchParams();
  const status = pick(filters.status, STATUS_ORDER);
  if (status.length > 0 && !sameList(status, DEFAULT_STATUSES)) p.set('status', status.join(','));
  const sev = pick(filters.sev, SEVERITY_ORDER);
  if (sev.length > 0) p.set('sev', sev.join(','));
  const category = pick(filters.category, EVENT_CATEGORIES);
  if (category.length > 0) p.set('category', category.join(','));
  const bay = [...new Set(filters.bay.filter((b) => BAY_RE.test(b)))].sort();
  if (bay.length > 0) p.set('bay', bay.join(','));
  const q = filters.q.trim().slice(0, MAX_Q);
  if (q !== '') p.set('q', q);
  if (filters.from !== null) p.set('from', isoDhaka(filters.from));
  if (filters.to !== null) p.set('to', isoDhaka(filters.to));
  if (filters.group !== null) p.set('group', filters.group);
  if (filters.groupBy === 'visit') p.set('groupBy', 'visit');
  return p.toString();
}

/** `/events` with the filters. */
export function eventsPath(filters?: EventFilters): string {
  const qs = filters ? serializeEventFilters(filters) : '';
  return qs ? `/events?${qs}` : '/events';
}

/** `/events/:id`, optionally keeping the list filters behind the drawer. */
export function eventPath(id: string, filters?: EventFilters): string {
  const qs = filters ? serializeEventFilters(filters) : '';
  return `/events/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`;
}
