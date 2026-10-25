// @vitest-environment node
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import {
  AdminUserSchema,
  AlertRuleSchema,
  ApiErrorSchema,
  BayCfgSchema,
  BeltUtilisationResponseSchema,
  CameraCfgSchema,
  CameraUptimeResponseSchema,
  ComplianceResponseSchema,
  DwellResponseSchema,
  EmployeeSchema,
  HygieneResponseSchema,
  LeaderboardResponseSchema,
  LoginResponseSchema,
  NatsCredsSchema,
  PageSchema,
  PeopleResponseSchema,
  PresignSchema,
  ProductivityResponseSchema,
  ReplayResponseSchema,
  ReportSchema,
  RosterAssignmentSchema,
  ShiftsConfigSchema,
  SiteConfigSchema,
  SiteSummarySchema,
  SkuAnalyticsResponseSchema,
  SkuSchema,
  SnapshotSchema,
  TelegramCfgSchema,
  ThresholdsSchema,
  ThroughputResponseSchema,
  UserSchema,
  VisitDetailSchema,
  VisitSchema,
  WhEventWithStatusSchema,
  type EventLifecycleUpdate,
  type WhEventWithStatus,
} from '@/domain';
import { CFG, PEAK } from '../mock/core/testing';
import { MIN } from '../mock/core/clock';
import { InlineHost, SimRuntime } from '../mock/runtime';
import { createHandlers } from './handlers';
import { createSession, loginAs } from './session';

const BASE = 'http://localhost/api';

const host = new InlineHost({ autoTick: false, now: () => PEAK });
const runtime = new SimRuntime(host);
const session = createSession();
const server = setupServer(...createHandlers({ runtime, session }));
const lifecycle: EventLifecycleUpdate[] = [];

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function getJson<S extends z.ZodType>(
  path: string,
  schema: S,
  status = 200,
): Promise<z.output<S>> {
  const res = await call('GET', path);
  const text = await res.text();
  expect(res.status, `${path}: ${text.slice(0, 300)}`).toBe(status);
  const r = schema.safeParse(JSON.parse(text));
  expect(r.success, `${path}: ${r.success ? '' : JSON.stringify(r.error.issues.slice(0, 3))}`).toBe(
    true,
  );
  return r.data as z.output<S>;
}

const asManager = () => loginAs(session, 'manager', 'x');

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });
  runtime.onBatch((b) => {
    for (const m of b.items) if (m.kind === 'lifecycle') lifecycle.push(m.value);
  });
  await runtime.ensure({ seed: 5, scenario: 'peak', speed: 1, startMs: PEAK });
  host.controller.advance(30 * MIN);
}, 60_000);

afterAll(() => {
  server.close();
  runtime.dispose();
});

describe('read endpoints return contract-valid data', { timeout: 60_000 }, () => {
  it('GET /sites, /sites/{site}/config, /sites/{site}/snapshot', async () => {
    const sites = await getJson('/sites', SiteSummarySchema.array());
    expect(sites[0]?.baysTotal).toBe(7);
    const config = await getJson('/sites/dhk-depot/config', SiteConfigSchema);
    expect(config.dockFaces[0]?.bays).toHaveLength(7);
    const snap = await getJson('/sites/dhk-depot/snapshot', SnapshotSchema);
    expect(snap.bays).toHaveLength(7);
    expect(snap.health.cams).toHaveLength(21);
    expect((await call('GET', '/sites/other/config')).status).toBe(404);
  });

  it('GET /events with cursor pagination and every filter', async () => {
    const Page = PageSchema(WhEventWithStatusSchema);
    const all = await getJson('/events?limit=200', Page);
    expect(all.items.length).toBeGreaterThan(50);
    // pages of 25 reproduce the same sequence without gaps or repeats
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 400; i++) {
      const page: z.output<typeof Page> = await getJson(
        `/events?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        Page,
      );
      seen.push(...page.items.map((e) => e.id));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.slice(0, 200)).toEqual(all.items.map((e) => e.id));
    const ts = all.items.map((e) => Date.parse(e.ts));
    expect(ts).toEqual([...ts].sort((a, b) => b - a));

    const hyg = await getJson('/events?category=hygiene&limit=100', Page);
    expect(hyg.items.length).toBeGreaterThan(0);
    expect(hyg.items.every((e) => e.category === 'hygiene')).toBe(true);
    const crit = await getJson('/events?sev=warn,critical&bay=B01,B02&limit=100', Page);
    expect(crit.items.every((e) => e.sev !== 'info' && (e.bay === 'B01' || e.bay === 'B02'))).toBe(
      true,
    );
    const open = await getJson('/events?status=OPEN&limit=100', Page);
    expect(open.items.every((e) => e.status === 'OPEN')).toBe(true);
    const closed = await getJson('/events?status=CLOSED&limit=100', Page);
    expect(closed.items.every((e) => e.status === 'CLOSED')).toBe(true);
    const q = await getJson('/events?q=damaged&limit=100', Page);
    expect(q.items.length).toBeGreaterThan(0);
    expect(
      q.items.every((e) => e.type === 'damaged' || e.title.en.toLowerCase().includes('damaged')),
    ).toBe(true);
    const mid = Date.parse(all.items[Math.floor(all.items.length / 2)]?.ts ?? '');
    const since = await getJson(
      `/events?since=${encodeURIComponent(new Date(mid).toISOString())}&limit=200`,
      Page,
    );
    expect(since.items.every((e) => Date.parse(e.ts) > mid)).toBe(true);
    // an ISO offset with a raw "+" (query-string space) is understood
    const win = await getJson(
      `/events?from=2026-10-24T19:00:00+06:00&to=2026-10-24T19:30:00+06:00&limit=200`,
      Page,
    );
    expect(
      win.items.every(
        (e) =>
          Date.parse(e.ts) >= Date.parse('2026-10-24T19:00:00+06:00') &&
          Date.parse(e.ts) < Date.parse('2026-10-24T19:30:00+06:00'),
      ),
    ).toBe(true);
    expect(win.items.length).toBeGreaterThan(0);
  });

  it('GET /events/{id} and 404', async () => {
    const first = (await getJson('/events?limit=1', PageSchema(WhEventWithStatusSchema))).items[0];
    expect(first).toBeDefined();
    const one = await getJson(`/events/${first?.id}`, WhEventWithStatusSchema);
    expect(one.id).toBe(first?.id);
    const res = await call('GET', '/events/01M5Q2V6W0M9S346Q3D25VT4FZ');
    expect(res.status).toBe(404);
    expect(ApiErrorSchema.safeParse(await res.json()).success).toBe(true);
  });

  it('GET /visits (filters, pagination) and /visits/{id}', async () => {
    const Page = PageSchema(VisitSchema);
    const all = await getJson('/visits?limit=200', Page);
    expect(all.items.length).toBeGreaterThan(30);
    expect(all.items.every((v) => v.site === 'dhk-depot')).toBe(true);
    const p1 = await getJson('/visits?limit=10', Page);
    const p2 = await getJson(
      `/visits?limit=10&cursor=${encodeURIComponent(p1.nextCursor ?? '')}`,
      Page,
    );
    expect(p1.items.map((v) => v.visitId)).toEqual(all.items.slice(0, 10).map((v) => v.visitId));
    expect(p2.items.map((v) => v.visitId)).toEqual(all.items.slice(10, 20).map((v) => v.visitId));
    const b3 = await getJson('/visits?bay=B03&limit=200', Page);
    expect(b3.items.every((v) => v.bay === 'B03')).toBe(true);
    const plate = all.items[0]?.plate.en.split(' ')[1] ?? '';
    const byPlate = await getJson(`/visits?plate=${encodeURIComponent(plate)}&limit=200`, Page);
    expect(byPlate.items.length).toBeGreaterThan(0);
    expect(byPlate.items.every((v) => v.plate.en.includes(plate))).toBe(true);
    const agency = all.items.find((v) => v.agency)?.agency?.en ?? '';
    const byAgency = await getJson(`/visits?agency=${encodeURIComponent(agency)}&limit=200`, Page);
    expect(byAgency.items.every((v) => v.agency?.en === agency)).toBe(true);
    const done = all.items.find((v) => v.phase === 'DEPARTED');
    expect(done).toBeDefined();
    const detail = await getJson(`/visits/${done?.visitId}`, VisitDetailSchema);
    expect(detail.visit.visitId).toBe(done?.visitId);
    expect(detail.events.length).toBeGreaterThan(3);
    expect(done?.dwell.totalMin).not.toBeNull();
    expect(detail.events.map((e) => e.id)).toEqual(detail.visit.eventIds);
    expect((await call('GET', '/visits/V-20200101-B01-0001')).status).toBe(404);
  });

  it('GET /analytics/*', async () => {
    const day = 'from=2026-10-23&to=2026-10-24';
    const tp = await getJson(`/analytics/throughput?${day}&bucket=hour`, ThroughputResponseSchema);
    expect(tp.series).toHaveLength(14);
    expect(tp.series[0]?.points).toHaveLength(24);
    const total = tp.series.flatMap((s) => s.points).reduce((n, p) => n + (p.v ?? 0), 0);
    expect(total).toBeGreaterThan(5000);
    const one = await getJson(
      `/analytics/throughput?${day}&bucket=day&bay=B01&dir=OUT`,
      ThroughputResponseSchema,
    );
    expect(one.series.map((s) => s.key)).toEqual(['B01.OUT']);
    const week = await getJson(
      '/analytics/throughput?from=2026-10-18&to=2026-10-24&bucket=day',
      ThroughputResponseSchema,
    );
    // day buckets start at the business-day boundary (06:00), so the bucket holding 'from' is the first
    expect(week.series[0]?.points).toHaveLength(7);

    for (const groupBy of ['bay', 'agency']) {
      const dwell = await getJson(
        `/analytics/dwell?from=2026-10-18&to=2026-10-24&groupBy=${groupBy}`,
        DwellResponseSchema,
      );
      expect(dwell.groups.length).toBeGreaterThan(1);
      expect(dwell.histogram.length).toBeGreaterThan(2);
    }
    const belt = await getJson(`/analytics/belt-utilisation?${day}`, BeltUtilisationResponseSchema);
    expect(belt.bays).toHaveLength(7);
    for (const b of belt.bays) {
      const sum = Object.values(b.sec).reduce((s, v) => s + v, 0);
      expect(Math.abs(sum - 86_400)).toBeLessThan(1); // the day is fully covered by intervals
    }
    const sku = await getJson(`/analytics/sku?${day}`, SkuAnalyticsResponseSchema);
    expect(sku.rows.length).toBeGreaterThan(10);
    expect(sku.unknownSharePct).toBeGreaterThan(2);
    const visit = (await getJson('/visits?limit=50', PageSchema(VisitSchema))).items.find(
      (v) => v.phase === 'DEPARTED',
    );
    const bySku = await getJson(
      `/analytics/sku?visitId=${visit?.visitId}`,
      SkuAnalyticsResponseSchema,
    );
    expect(bySku.rows.reduce((n, r) => n + r.count, 0)).toBe(
      (visit?.casesOut ?? 0) + (visit?.casesIn ?? 0),
    );
    await getJson(`/analytics/sku?${day}&bay=B02`, SkuAnalyticsResponseSchema);
    const comp = await getJson(
      '/analytics/compliance?from=2026-10-18&to=2026-10-24',
      ComplianceResponseSchema,
    );
    expect(comp.byType.length).toBeGreaterThan(0);
    expect(comp.score.points.length).toBeGreaterThan(3);
    const hyg = await getJson(
      '/analytics/hygiene?from=2026-10-18&to=2026-10-24',
      HygieneResponseSchema,
    );
    expect(hyg.bySku.length).toBeGreaterThan(5);
    expect(hyg.byBay).toHaveLength(7);
    expect(hyg.byAgency.length).toBeGreaterThan(2);
    const prod = await getJson(
      '/analytics/productivity?from=2026-10-18&to=2026-10-24',
      ProductivityResponseSchema,
    );
    expect(prod.rows.length).toBeGreaterThan(7);
    const cams = await getJson(
      '/analytics/camera-uptime?from=2026-10-18&to=2026-10-24',
      CameraUptimeResponseSchema,
    );
    expect(cams.cams).toHaveLength(21);
    expect(cams.cams.some((c) => c.incidents > 0)).toBe(true);
  });

  it('GET /leaderboard for every period, with names gated by role', async () => {
    for (const period of ['shift', 'day', 'week', 'month']) {
      const lb = await getJson(`/leaderboard?period=${period}`, LeaderboardResponseSchema);
      expect(lb.period).toBe(period);
      expect(lb.rows.map((r) => r.rank)).toEqual(lb.rows.map((_, i) => i + 1));
      const scores = lb.rows.map((r) => r.score);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
      for (const r of lb.rows) {
        expect(r.name).not.toBeNull(); // manager sees names
        expect(r.trend).toHaveLength(7);
      }
    }
    const dated = await getJson(
      '/leaderboard?period=shift&date=2026-10-23&shift=B',
      LeaderboardResponseSchema,
    );
    expect(dated.rows.length).toBeGreaterThan(3);
    expect((await call('GET', '/leaderboard?period=shift&shift=Z')).status).toBe(404);
    loginAs(session, 'hq', 'x');
    const hq = await getJson('/leaderboard?period=week', LeaderboardResponseSchema);
    expect(hq.rows.every((r) => r.name === null)).toBe(true);
    asManager();
  });

  it('GET /reports/shift, /reports/daily and the csv export', async () => {
    const shift = await getJson('/reports/shift?date=2026-10-23&shift=B', ReportSchema);
    expect(shift.kind).toBe('shift');
    expect(shift.shiftId).toBe('B');
    expect(shift.bays).toHaveLength(7);
    expect(shift.visits.length).toBeGreaterThan(5);
    expect(shift.topEvents.length).toBeGreaterThan(0);
    const daily = await getJson('/reports/daily?date=2026-10-23', ReportSchema);
    expect(daily.kind).toBe('daily');
    expect(daily.shiftId).toBeNull();
    expect(daily.kpi.casesOut).toBeGreaterThan(shift.kpi.casesOut);
    const live = await getJson('/reports/shift', ReportSchema);
    expect(live.kpi.baysTotal).toBe(7);
    const csv = await call('GET', '/reports/daily/export?date=2026-10-23&fmt=csv');
    expect(csv.status).toBe(200);
    expect(csv.headers.get('content-type')).toContain('text/csv');
    const text = await csv.text();
    expect(text.split('\n')[0]).toContain('bay,casesOut');
    expect(text.trim().split('\n')).toHaveLength(8);
    expect((await call('GET', '/reports/daily/export?fmt=pdf')).status).toBe(501);
  });

  it('GET /replay is limited to 10 minutes', async () => {
    const ok = await getJson(
      '/replay?from=2026-10-24T19:00:00%2B06:00&to=2026-10-24T19:05:00%2B06:00',
      ReplayResponseSchema,
    );
    expect(ok.events.length).toBeGreaterThan(0);
    expect(
      (await call('GET', '/replay?from=2026-10-24T19:00:00%2B06:00&to=2026-10-24T19:30:00%2B06:00'))
        .status,
    ).toBe(400);
  });
});

describe('worker behaviour is a manager-only report', { timeout: 60_000 }, () => {
  it('GET /analytics/people is served to DC_MANAGER and ADMIN and nobody else', async () => {
    asManager();
    const people = await getJson(
      '/analytics/people?from=2026-10-23&to=2026-10-24',
      PeopleResponseSchema,
    );
    expect(people.rows.length).toBeGreaterThan(20);
    const raw = JSON.stringify(people);
    expect(raw).toContain('phoneMin');
    for (const r of people.rows) {
      expect(r.idleMin).toBeGreaterThan(0);
      expect(r.trackId).toMatch(/^t-\d+$/);
      expect(r).not.toHaveProperty('employeeId');
    }
    const b2 = await getJson(
      '/analytics/people?from=2026-10-23&to=2026-10-24&bay=B02',
      PeopleResponseSchema,
    );
    expect(b2.rows.every((r) => r.bay === 'B02')).toBe(true);
    // stable between calls
    const again = await getJson(
      '/analytics/people?from=2026-10-23&to=2026-10-24',
      PeopleResponseSchema,
    );
    expect(again).toEqual(people);
    loginAs(session, 'admin', 'x');
    await getJson('/analytics/people?from=2026-10-23&to=2026-10-24', PeopleResponseSchema);
    for (const who of ['supervisor', 'hq', 'security', 'kiosk']) {
      loginAs(session, who, 'x');
      const res = await call('GET', '/analytics/people');
      expect(res.status, who).toBe(403);
      expect(ApiErrorSchema.safeParse(await res.json()).success).toBe(true);
    }
    asManager();
  });
});

describe('event lifecycle mutations', { timeout: 60_000 }, () => {
  it('ack, note and close update the event and emit EventLifecycleUpdate', async () => {
    asManager();
    const open = (
      await getJson(
        '/events?status=OPEN&category=hygiene&limit=5',
        PageSchema(WhEventWithStatusSchema),
      )
    ).items[0] as WhEventWithStatus;
    expect(open).toBeDefined();
    const before = lifecycle.length;
    const acked = await call('POST', `/events/${open.id}/ack`);
    expect(acked.status).toBe(200);
    const ackBody = WhEventWithStatusSchema.parse(await acked.json());
    expect(ackBody.status).toBe('ACK');
    expect(ackBody.ack?.by).toBe('Depot Manager');
    expect(lifecycle.slice(before).map((u) => [u.id, u.status])).toEqual([[open.id, 'ACK']]);
    expect(lifecycle.at(-1)?.by).toEqual({ userId: 'u-01', name: 'Depot Manager' });

    expect((await call('POST', `/events/${open.id}/ack`)).status).toBe(409);
    expect((await call('POST', `/events/${open.id}/close`, {})).status).toBe(400);
    const noted = WhEventWithStatusSchema.parse(
      await (
        await call('POST', `/events/${open.id}/note`, { text: 'checked on the floor' })
      ).json(),
    );
    expect(noted.status).toBe('ACK');
    expect(noted.notes.map((n) => n.text)).toEqual(['checked on the floor']);
    expect(lifecycle.at(-1)).toMatchObject({
      id: open.id,
      status: 'ACK',
      note: 'checked on the floor',
    });

    const closed = WhEventWithStatusSchema.parse(
      await (await call('POST', `/events/${open.id}/close`, { note: 'case replaced' })).json(),
    );
    expect(closed.status).toBe('CLOSED');
    expect(closed.closed?.note).toBe('case replaced');
    expect(lifecycle.at(-1)).toMatchObject({
      id: open.id,
      status: 'CLOSED',
      note: 'case replaced',
    });
    expect((await call('POST', `/events/${open.id}/close`, { note: 'again' })).status).toBe(409);
    const reread = await getJson(`/events/${open.id}`, WhEventWithStatusSchema);
    expect(reread.status).toBe('CLOSED');
    expect((await call('POST', '/events/01M5Q2V6W0M9S346Q3D25VT4FZ/ack')).status).toBe(404);
    // the snapshot no longer lists it as open
    const snap = await getJson('/sites/dhk-depot/snapshot', SnapshotSchema);
    expect(snap.openEvents.some((e) => e.id === open.id)).toBe(false);
  });

  it('a closed alert lowers the open count published for its bay', async () => {
    const snap = await getJson('/sites/dhk-depot/snapshot', SnapshotSchema);
    const bay = snap.bays.find((b) => b.alerts.open > 0);
    expect(bay).toBeDefined();
    const target = snap.openEvents.find((e) => e.bay === bay?.bay);
    expect(target).toBeDefined();
    await call('POST', `/events/${target?.id}/close`, { note: 'ok' });
    const after = await getJson('/sites/dhk-depot/snapshot', SnapshotSchema);
    expect(after.bays.find((b) => b.bay === bay?.bay)?.alerts.open).toBe(
      (bay?.alerts.open ?? 0) - 1,
    );
  });
});

describe('media and auth', { timeout: 60_000 }, () => {
  it('GET /media/presign returns a blob: URL for a snapshot and refuses clips', async () => {
    asManager();
    const events = (await getJson('/events?limit=200', PageSchema(WhEventWithStatusSchema))).items;
    const withMedia = events.find((e) => e.media);
    expect(withMedia?.media?.clipKey).toBeNull();
    const key = withMedia?.media?.snapshotKey ?? '';
    const created = vi.spyOn(URL, 'createObjectURL');
    const p = await getJson(`/media/presign?key=${encodeURIComponent(key)}`, PresignSchema);
    expect(p.url.startsWith('blob:')).toBe(true);
    expect(Date.parse(p.expiresAt)).toBeGreaterThan(Date.now());
    const blob = created.mock.calls.at(-1)?.[0] as Blob | undefined;
    expect(blob?.type).toBe('image/jpeg');
    expect(blob?.size ?? 0).toBeGreaterThan(50);
    created.mockRestore();
    const again = await getJson(`/media/presign?key=${encodeURIComponent(key)}`, PresignSchema);
    expect(again.url).toBe(p.url);
    expect(
      (await call('GET', `/media/presign?key=${encodeURIComponent(key.replace('.jpg', '.mp4'))}`))
        .status,
    ).toBe(404);
    expect((await call('GET', '/media/presign?key=nope')).status).toBe(400);
  });

  it('login, me, nats-refresh and logout', async () => {
    const bad = await call('POST', '/auth/login', { username: 'nobody', password: 'x' });
    expect(bad.status).toBe(401);
    const res = await call('POST', '/auth/login', { username: 'supervisor', password: 'pw' });
    const login = LoginResponseSchema.parse(await res.json());
    expect(login.user.role).toBe('SHIFT_SUPERVISOR');
    expect(NatsCredsSchema.safeParse(login.natsCreds).success).toBe(true);
    expect(UserSchema.parse(await (await call('GET', '/me')).json()).id).toBe('u-07');
    expect(
      NatsCredsSchema.safeParse(await (await call('POST', '/auth/nats-refresh')).json()).success,
    ).toBe(true);
    expect((await call('POST', '/auth/logout')).status).toBe(204);
    expect((await call('GET', '/me')).status).toBe(401);
    expect((await call('GET', '/events')).status).toBe(401);
    asManager();
    expect((await call('GET', '/me')).status).toBe(200);
  });
});

describe('admin objects', { timeout: 60_000 }, () => {
  it('GET returns valid objects', async () => {
    asManager();
    expect((await getJson('/admin/shifts', ShiftsConfigSchema)).shifts).toHaveLength(3);
    const roster = await getJson('/admin/roster', RosterAssignmentSchema.array());
    expect(roster).toHaveLength(7);
    expect(new Set(roster.map((r) => r.employeeId)).size).toBe(7);
    expect((await getJson('/admin/employees', EmployeeSchema.array())).length).toBeGreaterThan(30);
    expect((await getJson('/admin/skus', SkuSchema.array())).length).toBe(14);
    expect(await getJson('/admin/thresholds', ThresholdsSchema)).toEqual(CFG.thresholds);
    expect((await getJson('/admin/alert-rules', AlertRuleSchema.array())).length).toBeGreaterThan(
      1,
    );
    loginAs(session, 'admin', 'x');
    expect(await getJson('/admin/bays', BayCfgSchema.array())).toHaveLength(7);
    expect(await getJson('/admin/cameras', CameraCfgSchema.array())).toHaveLength(21);
    expect((await getJson('/admin/telegram', TelegramCfgSchema)).botConfigured).toBe(false);
    expect((await getJson('/admin/users', AdminUserSchema.array())).length).toBe(6);
    asManager();
  });

  it('PUT validates and round-trips; thresholds take effect in the simulator', async () => {
    asManager();
    const shifts = await getJson('/admin/shifts', ShiftsConfigSchema);
    expect((await call('PUT', '/admin/shifts', { shifts: 'nope' })).status).toBe(400);
    expect((await call('PUT', '/admin/shifts', shifts)).status).toBe(200);

    const th = await getJson('/admin/thresholds', ThresholdsSchema);
    const put = await call('PUT', '/admin/thresholds', { ...th, detentionMin: 75 });
    expect(ThresholdsSchema.parse(await put.json()).detentionMin).toBe(75);
    expect((await getJson('/admin/thresholds', ThresholdsSchema)).detentionMin).toBe(75);
    await call('PUT', '/admin/thresholds', th);

    const roster = await getJson(
      '/admin/roster?date=2026-10-24&shift=B',
      RosterAssignmentSchema.array(),
    );
    const first = roster[0];
    const other = (await getJson('/admin/employees', EmployeeSchema.array())).find(
      (e) => e.role === 'CAPTAIN' && e.employeeId !== first?.employeeId,
    );
    const changed = await call('PUT', '/admin/roster', [
      { ...first, employeeId: other?.employeeId },
    ]);
    const list = RosterAssignmentSchema.array().parse(await changed.json());
    expect(list.find((r) => r.bay === first?.bay)?.employeeId).toBe(other?.employeeId);
    expect(
      (await call('PUT', '/admin/roster', [{ ...first, employeeId: 'EMP-3001' }])).status,
    ).toBe(400);

    const rules = await getJson('/admin/alert-rules', AlertRuleSchema.array());
    const toggled = rules.map((r, i) => (i === 0 ? { ...r, enabled: false } : r));
    expect((await (await call('PUT', '/admin/alert-rules', toggled)).json())[0].enabled).toBe(
      false,
    );
    const test = await call('POST', `/admin/alert-rules/${rules[0]?.id}/test`);
    expect(test.status).toBe(204);
    expect((await call('POST', '/admin/alert-rules/missing/test')).status).toBe(404);
  });

  it('PUT round-trips the remaining admin objects', async () => {
    loginAs(session, 'admin', 'x');
    const skus = await getJson('/admin/skus', SkuSchema.array());
    const edited = skus.map((k, i) => (i === 0 ? { ...k, color: '#112233' } : k));
    expect((await (await call('PUT', '/admin/skus', edited)).json())[0].color).toBe('#112233');
    expect((await getJson('/admin/skus', SkuSchema.array()))[0]?.color).toBe('#112233');
    expect((await call('PUT', '/admin/skus', [{ sku: 'X' }])).status).toBe(400);

    const bays = await getJson('/admin/bays', BayCfgSchema.array());
    const off = bays.map((b, i) => (i === 6 ? { ...b, enabled: false } : b));
    expect((await getJson('/admin/bays', BayCfgSchema.array())).every((b) => b.enabled)).toBe(true);
    await call('PUT', '/admin/bays', off);
    expect((await getJson('/admin/bays', BayCfgSchema.array()))[6]?.enabled).toBe(false);

    const cams = await getJson('/admin/cameras', CameraCfgSchema.array());
    expect(JSON.stringify(cams)).not.toMatch(/password|credential|rtsp:\/\//i);
    await call(
      'PUT',
      '/admin/cameras',
      cams.map((c, i) => (i === 0 ? { ...c, enabled: false } : c)),
    );
    expect((await getJson('/admin/cameras', CameraCfgSchema.array()))[0]?.enabled).toBe(false);

    const tg = {
      botConfigured: true,
      botName: 'depot_bot',
      digestChatIds: ['-1001'],
      digestAtShiftEnd: false,
    };
    expect(
      TelegramCfgSchema.parse(await (await call('PUT', '/admin/telegram', tg)).json()),
    ).toEqual(tg);
    expect(JSON.stringify(await getJson('/admin/telegram', TelegramCfgSchema))).not.toMatch(
      /token/i,
    );

    const users = await getJson('/admin/users', AdminUserSchema.array());
    await call(
      'PUT',
      '/admin/users',
      users.map((u, i) => (i === 1 ? { ...u, active: false } : u)),
    );
    expect((await getJson('/admin/users', AdminUserSchema.array()))[1]?.active).toBe(false);
    asManager();
  });

  it('is gated by role (docs/01 section 3)', async () => {
    loginAs(session, 'supervisor', 'x');
    expect((await call('GET', '/admin/roster')).status).toBe(200);
    expect((await call('GET', '/admin/skus')).status).toBe(403);
    loginAs(session, 'manager', 'x');
    expect((await call('GET', '/admin/users')).status).toBe(403);
    expect((await call('GET', '/admin/cameras')).status).toBe(403);
    loginAs(session, 'kiosk', 'x');
    expect((await call('GET', '/admin/shifts')).status).toBe(403);
    asManager();
  });
});
