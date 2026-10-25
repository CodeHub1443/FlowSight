import type { Role, SiteSummary, Snapshot, WhEventWithStatus } from '@/domain';
import type { Depot } from '../depot';
import { adminRoute } from './admin';
import {
  beltUtilisation,
  cameraUptime,
  compliance,
  dwell,
  hygiene,
  productivity,
  skuAnalytics,
  throughput,
} from './analytics';
import { leaderboard, report, reportCsv } from './reports';
import {
  bad,
  csv,
  err,
  eventsOfVisit,
  notFound,
  ok,
  pageOf,
  parseTs,
  timeWindow,
  visitFor,
  type ApiRequest,
  type ApiResponse,
} from './util';

export type { ApiActor, ApiRequest, ApiResponse } from './util';
export { MOCK_LOGINS, MOCK_USERS } from './admin';

const SEV_ORDER = { info: 0, warn: 1, critical: 2 } as const;

function filterEvents(depot: Depot, q: Record<string, string>): WhEventWithStatus[] {
  const cats = csv(q.category);
  const sevs = csv(q.sev);
  const bays = csv(q.bay);
  const statuses = csv(q.status);
  const text = q.q?.trim().toLowerCase();
  const hasRange = q.from !== undefined || q.to !== undefined;
  const from = hasRange ? parseTs(q.from, 0) : 0;
  const to = hasRange ? parseTs(q.to, Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
  const since = q.since ? parseTs(q.since, 0) : null;
  const out: WhEventWithStatus[] = [];
  const all = depot.store.events;
  for (let i = all.length - 1; i >= 0; i--) {
    const e = all[i] as WhEventWithStatus;
    const t = Date.parse(e.ts);
    if (since !== null && t <= since) break;
    if (t >= to) continue;
    if (t < from) break;
    if (cats && !cats.includes(e.category)) continue;
    if (sevs && !sevs.includes(e.sev)) continue;
    if (bays && !bays.includes(e.bay ?? '')) continue;
    if (statuses && !statuses.includes(e.status)) continue;
    if (text) {
      const hay =
        `${e.id} ${e.category}.${e.type} ${e.title.en} ${e.title.bn} ${e.bay ?? ''} ${e.refs.plateEn ?? ''} ${e.refs.visitId ?? ''} ${e.refs.sku ?? ''}`.toLowerCase();
      if (!hay.includes(text)) continue;
    }
    out.push(e);
  }
  return out;
}

function snapshot(depot: Depot): Snapshot {
  const msgs = depot.snapshot();
  const bays = msgs.flatMap((m) => (m.kind === 'bayState' ? [m.value] : []));
  const site = msgs.flatMap((m) => (m.kind === 'siteState' ? [m.value] : []))[0];
  const health = msgs.flatMap((m) => (m.kind === 'health' ? [m.value] : []))[0];
  if (!site || !health) throw new Error('snapshot is incomplete');
  const open = [...depot.store.events]
    .reverse()
    .filter((e) => e.status !== 'CLOSED')
    .slice(0, 100)
    .sort((a, b) => SEV_ORDER[b.sev] - SEV_ORDER[a.sev] || Date.parse(b.ts) - Date.parse(a.ts));
  return { site, bays, openEvents: open, health };
}

function mutate(
  depot: Depot,
  req: ApiRequest,
  id: string,
  action: 'ack' | 'close' | 'note',
): ApiResponse {
  const by = { userId: req.actor.userId, name: req.actor.name };
  const body = (req.body ?? {}) as Record<string, unknown>;
  let result;
  if (action === 'ack') {
    result = depot.ackEvent(id, by);
  } else if (action === 'close') {
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (!note) return bad('a closing note is required');
    result = depot.closeEvent(id, by, depot.now, note);
  } else {
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) return bad('note text is required');
    result = depot.noteEvent(id, by, text);
  }
  if (result === 'MISSING') return notFound('event');
  if (result === 'STATE') return err(409, 'INVALID_STATE', 'event is already past that status');
  return ok(result);
}

/** The whole REST surface of docs/03 section 4, except auth, media presign and /analytics/people (main thread). */
export function handleApi(depot: Depot, req: ApiRequest): ApiResponse {
  const { method, path, query: q, actor } = req;
  const role: Role = actor.role;
  let m: RegExpExecArray | null;

  const admin = adminRoute(depot, req);
  if (admin) return admin;

  if (method === 'GET') {
    if (path === '/sites') {
      const running = depot.bays.filter((b) => b.running).length;
      const offline = depot.bays.some((b) =>
        ['DOCK', 'CREW', 'BELT'].some((r) => depot.camStatus(`${b.id}-${r}`) !== 'OK'),
      );
      const summary: SiteSummary[] = [
        {
          id: depot.site,
          name: depot.cfg.name,
          baseUrl: '',
          baysTotal: depot.bays.length,
          baysRunning: running,
          status: offline ? 'DEGRADED' : 'ONLINE',
        },
      ];
      return ok(summary);
    }
    if ((m = /^\/sites\/([^/]+)\/(config|snapshot)$/.exec(path))) {
      if (m[1] !== depot.site) return notFound('site');
      return ok(m[2] === 'config' ? depot.cfg : snapshot(depot));
    }
    if (path === '/events') return ok(pageOf(filterEvents(depot, q), q));
    if ((m = /^\/events\/([0-9A-Z]{26})$/.exec(path))) {
      const e = depot.store.eventById.get(m[1] ?? '');
      return e ? ok(e) : notFound('event');
    }
    if (path === '/visits') {
      const plate = q.plate?.trim().toLowerCase();
      const agency = q.agency?.trim().toLowerCase();
      const bays = csv(q.bay);
      const from = parseTs(q.from, 0);
      const to = parseTs(q.to, Number.POSITIVE_INFINITY);
      const rows = [];
      const all = depot.store.visits;
      for (let i = all.length - 1; i >= 0; i--) {
        const v = all[i];
        if (!v || v.arrivedAt >= to) continue;
        if (v.arrivedAt < from) break;
        if (bays && !bays.includes(v.bay)) continue;
        if (plate && !(v.plate.en.toLowerCase().includes(plate) || v.plate.bn.includes(plate)))
          continue;
        if (
          agency &&
          !(
            (v.agency?.en.toLowerCase().includes(agency) ?? false) ||
            (v.agency?.bn.includes(agency) ?? false)
          )
        )
          continue;
        rows.push(v);
      }
      const page = pageOf(rows, q);
      return ok({
        items: page.items.map((v) => visitFor(depot, v, role)),
        nextCursor: page.nextCursor,
      });
    }
    if ((m = /^\/visits\/(V-\d{8}-B\d{2}-\d{4})$/.exec(path))) {
      const v = depot.store.visitById.get(m[1] ?? '');
      return v
        ? ok({ visit: visitFor(depot, v, role), events: eventsOfVisit(depot, v) })
        : notFound('visit');
    }
    if ((m = /^\/analytics\/([a-z-]+)$/.exec(path))) {
      const { from, to } = timeWindow(depot, q);
      switch (m[1]) {
        case 'throughput':
          return ok(throughput(depot, q, from, to));
        case 'dwell':
          return ok(dwell(depot, q, from, to));
        case 'belt-utilisation':
          return ok(beltUtilisation(depot, q, from, to));
        case 'sku':
          return ok(skuAnalytics(depot, q, from, to));
        case 'compliance':
          return ok(compliance(depot, from, to));
        case 'hygiene':
          return ok(hygiene(depot, from, to));
        case 'productivity':
          return ok(productivity(depot, from, to));
        case 'camera-uptime':
          return ok(cameraUptime(depot, from, to));
        default:
          return notFound(`route ${path}`);
      }
    }
    if (path === '/__mock/presence') {
      // Internal: crew presence per worker track for the manager-only people report (built in the MSW layer).
      const { from, to } = timeWindow(depot, q);
      const rows: {
        bay: string;
        shift: string;
        trackId: string;
        visitId: string;
        presenceMin: number;
      }[] = [];
      for (const v of depot.store.visits) {
        if (v.crewFrom === null || v.crewTo === null || v.crewFrom < from || v.crewFrom >= to)
          continue;
        for (const trackId of v.workerTracks) {
          rows.push({
            bay: v.bay,
            shift: v.shiftId,
            trackId,
            visitId: v.visitId,
            presenceMin: (v.crewTo - v.crewFrom) / 60_000,
          });
        }
      }
      return ok({ rows });
    }
    if (path === '/leaderboard') {
      const r = leaderboard(depot, q, role);
      return r ? ok(r) : notFound('shift');
    }
    if ((m = /^\/reports\/(shift|daily)$/.exec(path))) {
      const r = report(depot, m[1] === 'shift' ? 'shift' : 'daily', q, role);
      return r ? ok(r) : notFound('shift');
    }
    if ((m = /^\/reports\/(shift|daily)\/export$/.exec(path))) {
      const fmt = q.fmt ?? 'csv';
      if (fmt !== 'csv') {
        return err(
          501,
          'NOT_IMPLEMENTED',
          `server-side ${fmt} export is not mocked; use the client-side export`,
        );
      }
      const r = report(depot, m[1] === 'shift' ? 'shift' : 'daily', q, role);
      if (!r) return notFound('shift');
      return {
        status: 200,
        body: reportCsv(r),
        contentType: 'text/csv',
        headers: { 'content-disposition': `attachment; filename="${m[1]}-${r.businessDay}.csv"` },
      };
    }
    if (path === '/replay') {
      const { from, to } = timeWindow(depot, q);
      if (to - from > 10 * 60_000) return bad('replay windows are limited to 10 minutes');
      // P2: keyframes and actors are not stored by the mock, only the events of the window
      return ok({ keyframes: [], actors: [], events: depot.store.eventsBetween(from, to) });
    }
  }

  if (method === 'POST' && (m = /^\/events\/([0-9A-Z]{26})\/(ack|close|note)$/.exec(path))) {
    const action = m[2] === 'ack' ? 'ack' : m[2] === 'close' ? 'close' : 'note';
    return mutate(depot, req, m[1] ?? '', action);
  }
  return notFound(`route ${path}`);
}
