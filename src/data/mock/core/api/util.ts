import type { Lang, Role, Visit, WhEventWithStatus } from '@/domain';
import { employeeName, skuName } from '../catalog';
import { DAY, HOUR, MIN, iso } from '../clock';
import type { Depot } from '../depot';
import { round } from '../rng';
import type { VisitRec } from '../types';

export interface ApiActor {
  userId: string;
  name: string;
  role: Role;
}

export interface ApiRequest {
  method: string;
  /** Path below the API base, e.g. `/events/01M5...`. */
  path: string;
  query: Record<string, string>;
  body?: unknown;
  actor: ApiActor;
}

export interface ApiResponse {
  status: number;
  body: unknown;
  contentType?: string;
  headers?: Record<string, string>;
}

export const ok = (body: unknown, status = 200): ApiResponse => ({ status, body });
export const err = (
  status: number,
  code: string,
  message: string,
  details?: unknown,
): ApiResponse => ({
  status,
  body: { error: { code, message, ...(details === undefined ? {} : { details }) } },
});
export const bad = (message: string, details?: unknown): ApiResponse =>
  err(400, 'BAD_REQUEST', message, details);
export const notFound = (what: string): ApiResponse => err(404, 'NOT_FOUND', `${what} not found`);

/** Roles that may see employee names (the site setting showCaptainNames only governs NATS). */
export const NAME_ROLES: ReadonlySet<Role> = new Set(['DC_MANAGER', 'SHIFT_SUPERVISOR', 'ADMIN']);

/** A query-string `+` in an ISO offset arrives as a space; put it back. */
function fixPlus(s: string): string {
  return s.replace(/(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?) (\d{2}:\d{2})$/, '$1+$2');
}

export function parseTs(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const s = fixPlus(raw.trim());
  const ms = /^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(`${s}T00:00:00+06:00`) : Date.parse(s);
  return Number.isNaN(ms) ? fallback : ms;
}

/** [from, to) with defaults "start of the current business day" .. "now". */
export function timeWindow(depot: Depot, q: Record<string, string>): { from: number; to: number } {
  const to = parseTs(q.to, depot.now);
  const from = parseTs(q.from, depot.clock.businessDayStart(depot.now));
  return { from, to: to <= from ? from + 1 : to };
}

export function csv(q: string | undefined): string[] | null {
  if (!q) return null;
  const parts = q
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : null;
}

export function pageOf<T>(
  items: T[],
  q: Record<string, string>,
): { items: T[]; nextCursor: string | null } {
  const limit = Math.min(200, Math.max(1, Number.parseInt(q.limit ?? '50', 10) || 50));
  let offset = 0;
  if (q.cursor) {
    try {
      const n = Number.parseInt(atob(q.cursor).replace(/^o:/, ''), 10);
      if (Number.isFinite(n) && n >= 0) offset = n;
    } catch {
      offset = 0;
    }
  }
  const slice = items.slice(offset, offset + limit);
  const next = offset + limit < items.length ? btoa(`o:${offset + limit}`) : null;
  return { items: slice, nextCursor: next };
}

export const mins = (ms: number): number => round(ms / MIN, 1);

export function toVisit(v: VisitRec, role: Role): Visit {
  const dwell = {
    waitToStartMin: v.startedAt === null ? null : mins(v.startedAt - v.arrivedAt),
    activeMin:
      v.startedAt === null || v.finishedAt === null ? null : mins(v.finishedAt - v.startedAt),
    postLoadMin:
      v.finishedAt === null || v.departedAt === null ? null : mins(v.departedAt - v.finishedAt),
    totalMin: v.departedAt === null ? null : mins(v.departedAt - v.arrivedAt),
  };
  const captain = v.captain;
  return {
    visitId: v.visitId,
    site: '',
    bay: v.bay,
    plate: v.plate,
    agency: v.agency,
    dir: v.dir,
    phase: v.phase,
    arrivedAt: iso(v.arrivedAt),
    dockedAt: v.dockedAt === null ? null : iso(v.dockedAt),
    startedAt: v.startedAt === null ? null : iso(v.startedAt),
    finishedAt: v.finishedAt === null ? null : iso(v.finishedAt),
    departedAt: v.departedAt === null ? null : iso(v.departedAt),
    dwell,
    casesOut: v.casesOut,
    casesIn: v.casesIn,
    expected: null,
    hygiene: {
      damaged: v.damaged,
      openTape: v.openTape,
      tornSack: v.tornSack,
      wetStained: v.wetStained,
      fallOff: v.fallOff,
    },
    sku: [...v.sku.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([sku, t]) => ({
        sku,
        name: skuName(sku),
        pack: t.pack,
        count: t.count,
        conf: sku === 'UNKNOWN' ? 0 : round(t.confSum / Math.max(1, t.count), 2),
      })),
    captain: captain
      ? { employeeId: captain, name: NAME_ROLES.has(role) ? employeeName(captain) : null }
      : null,
    eventIds: v.eventIds,
    detention: v.detention,
  };
}

export function visitFor(depot: Depot, v: VisitRec, role: Role): Visit {
  return { ...toVisit(v, role), site: depot.site };
}

export function eventsOfVisit(depot: Depot, v: VisitRec): WhEventWithStatus[] {
  const out: WhEventWithStatus[] = [];
  for (const id of v.eventIds) {
    const e = depot.store.eventById.get(id);
    if (e) out.push(e);
  }
  return out;
}

export function floorTo(ms: number, unit: 'hour' | 'day', depot: Depot): number {
  if (unit === 'hour') return Math.floor(ms / HOUR) * HOUR;
  return depot.clock.businessDayStart(ms);
}

export const stepOf = (unit: 'hour' | 'day'): number => (unit === 'hour' ? HOUR : DAY);

export function bayLabel(depot: Depot, bay: string): Lang {
  const b = depot.cfg.dockFaces[0]?.bays.find((x) => x.id === bay);
  return b ? b.label : { en: bay, bn: bay };
}
