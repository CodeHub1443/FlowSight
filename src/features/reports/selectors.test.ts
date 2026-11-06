import { describe, expect, it } from 'vitest';
import type { LeaderboardRow, Report, SkuRow, Visit, WhEventWithStatus } from '@/domain';
import { selectAlertGroups } from '@/features/live/kpiDetail/selectors';
import { DONE_SHIFT, LIVE_SHIFT, simReport } from './reportFixture';
import {
  beltLoadedShare,
  isEmptyReport,
  productIssuesOf,
  selectBayRows,
  selectCaptains,
  selectDeltas,
  selectEvidence,
  selectHandover,
  selectHeadlines,
  selectSku,
  selectTruckLog,
  shortId,
} from './selectors';

const base = (): Report => {
  const r = simReport('shift', DONE_SHIFT);
  if (!r) throw new Error('fixture');
  return r;
};

type EvInit = Partial<
  Pick<WhEventWithStatus, 'id' | 'ts' | 'sev' | 'status' | 'category' | 'type' | 'bay'>
> & { media?: boolean };

/** A minimal event for the selectors (they read id, ts, sev, status, category, type, bay and media only). */
const ev = (o: EvInit = {}): WhEventWithStatus => {
  const { media, ...rest } = o;
  return {
    id: 'E000001',
    ts: '2026-10-24T10:00:00+06:00',
    sev: 'warn',
    status: 'OPEN',
    category: 'ppe',
    type: 'violation',
    bay: 'B01',
    title: { en: 'Event', bn: 'ঘটনা' },
    media: media
      ? { snapshotKey: 'k', clipKey: null, bbox: [1, 1, 2, 2], frameW: 10, frameH: 10 }
      : null,
    ...rest,
  } as unknown as WhEventWithStatus;
};
const withEvents = (r: Report, events: WhEventWithStatus[]): Report => ({
  ...r,
  topEvents: events,
});

describe('headlines and deltas', () => {
  it('reads the KPI definitions and counts finished trucks like the truck log', () => {
    const r = base();
    const h = selectHeadlines(r);
    expect(h.casesOut).toBe(r.kpi.casesOut);
    expect(h.casesIn).toBe(r.kpi.casesIn);
    expect(h.trucksCompleted).toBe(r.visits.filter((v) => v.departedAt !== null).length);
    expect(h.trucksCompleted).toBe(selectTruckLog(r.visits).length);
    expect(h.occupancy).toEqual({ available: true, min: r.kpi.turnaround?.occupancyMin });
    expect(h.depotTatMin).toBe(r.kpi.turnaround?.depotTatMin);
    expect(h.ppePct).toBe(r.kpi.complianceScore);
  });

  it('hides occupancy on an older backend and falls back to avgTatMin', () => {
    const r = base();
    const old: Report = { ...r, kpi: { ...r.kpi, turnaround: undefined, avgTatMin: 70 } };
    const h = selectHeadlines(old);
    expect(h.occupancy.available).toBe(false);
    expect(h.depotTatMin).toBe(70);
  });

  it('needsAttention is critical + warn, info never inflates it', () => {
    const r = base();
    const h = selectHeadlines({
      ...r,
      kpi: { ...r.kpi, openAlerts: { critical: 2, warn: 3, info: 9 } },
    });
    expect(h.openAlerts).toEqual({ critical: 2, warn: 3, info: 9, needsAttention: 5 });
  });

  it('computes deltas against the previous period; a zero base has no percent', () => {
    const r = base();
    const cur = selectHeadlines({
      ...r,
      kpi: { ...r.kpi, casesOut: 120, casesIn: 10, complianceScore: 98 },
    });
    const prev = selectHeadlines({
      ...r,
      kpi: { ...r.kpi, casesOut: 100, casesIn: 0, complianceScore: 99.5 },
    });
    const d = selectDeltas(cur, prev);
    expect(d.casesOutPct).toBeCloseTo(20);
    expect(d.casesInPct).toBeNull();
    expect(d.ppePts).toBeCloseTo(-1.5);
    expect(d.trucks).toBe(cur.trucksCompleted - prev.trucksCompleted);
    expect(d.occupancyMin).toBe((cur.occupancy.min ?? 0) - (prev.occupancy.min ?? 0));
  });

  it('a delta is null when either side is unknown', () => {
    const r = base();
    const cur = selectHeadlines({ ...r, kpi: { ...r.kpi, complianceScore: null } });
    const prev = selectHeadlines(r);
    expect(selectDeltas(cur, prev).ppePts).toBeNull();
    expect(selectDeltas(prev, cur).ppePts).toBeNull();
  });
});

describe('handover', () => {
  const events = [
    ev({
      id: 'A00001',
      sev: 'warn',
      category: 'truck',
      type: 'detention',
      ts: '2026-10-24T10:00:00+06:00',
    }),
    ev({
      id: 'A00002',
      sev: 'critical',
      category: 'ppe',
      type: 'violation',
      ts: '2026-10-24T09:00:00+06:00',
    }),
    ev({
      id: 'A00003',
      sev: 'critical',
      category: 'system',
      type: 'camera_offline',
      ts: '2026-10-24T11:00:00+06:00',
      status: 'ACK',
    }),
    ev({
      id: 'A00004',
      sev: 'info',
      category: 'belt',
      type: 'fall_off',
      ts: '2026-10-24T12:00:00+06:00',
    }),
    ev({
      id: 'A00005',
      sev: 'warn',
      category: 'hygiene',
      type: 'damaged',
      ts: '2026-10-24T08:00:00+06:00',
    }),
    ev({
      id: 'A00006',
      sev: 'warn',
      category: 'hygiene',
      type: 'damaged',
      ts: '2026-10-24T13:00:00+06:00',
    }),
    ev({ id: 'A00007', sev: 'critical', category: 'ppe', type: 'violation', status: 'CLOSED' }),
  ];

  it('group counts equal selectAlertGroups over the open events (closed ones are not open)', () => {
    const r = withEvents(base(), events);
    const h = selectHandover(r, 'DC_MANAGER');
    const open = events.filter((e) => e.status !== 'CLOSED');
    expect(h.groups).toEqual(selectAlertGroups(open));
    expect(h.groups.reduce((s, g) => s + g.total, 0)).toBe(6);
    expect(h.listed).toBe(6);
  });

  it('lists the five most severe open or acknowledged events: severity, then newest', () => {
    const h = selectHandover(withEvents(base(), events), 'DC_MANAGER');
    expect(h.top.map((e) => e.id)).toEqual(['A00003', 'A00002', 'A00006', 'A00001', 'A00005']);
    expect(h.top.every((e) => e.status !== 'CLOSED')).toBe(true);
  });

  it('drops categories the role cannot view (security is not for HQ viewers)', () => {
    const sec = ev({ id: 'S00001', sev: 'critical', category: 'security', type: 'door_open_idle' });
    const r = withEvents(base(), [sec, ev({ id: 'A00001', sev: 'warn' })]);
    expect(selectHandover(r, 'HQ_VIEWER').top.map((e) => e.id)).toEqual(['A00001']);
    expect(selectHandover(r, 'DC_MANAGER').top.map((e) => e.id)).toEqual(['S00001', 'A00001']);
  });

  it('reports when the list is a subset of the KPI open count', () => {
    const r = withEvents(base(), events);
    const h = selectHandover(
      { ...r, kpi: { ...r.kpi, openAlerts: { critical: 4, warn: 10, info: 2 } } },
      'DC_MANAGER',
    );
    expect(h.total).toBe(16);
    expect(h.listed).toBeLessThan(h.total);
  });

  it('works on a real in-progress report', () => {
    const live = simReport('shift', LIVE_SHIFT);
    if (!live) throw new Error('fixture');
    const h = selectHandover(live, 'DC_MANAGER');
    expect(h.groups).toEqual(
      selectAlertGroups(live.topEvents.filter((e) => e.status !== 'CLOSED')),
    );
  });

  it('short id is the last six characters in upper case', () => {
    expect(shortId('01hxyzabc123def')).toBe('123DEF');
  });
});

describe('bays', () => {
  it('belt loaded share = loaded / (loaded + empty + stopped); zero denominators give null', () => {
    expect(beltLoadedShare({ runningLoaded: 60, runningEmpty: 20, stopped: 20 })).toBeCloseTo(0.6);
    expect(beltLoadedShare({ runningLoaded: 0, runningEmpty: 0, stopped: 0 })).toBeNull();
    expect(beltLoadedShare({ runningLoaded: 0, runningEmpty: 5, stopped: 0 })).toBe(0);
  });

  it('noTruck and offline time are not in the denominator', () => {
    const r = base();
    const b = r.bays[0];
    if (!b) throw new Error('fixture');
    const row = selectBayRows(
      {
        ...r,
        bays: [
          {
            ...b,
            beltSec: {
              runningLoaded: 50,
              runningEmpty: 50,
              stopped: 0,
              noTruck: 9999,
              offline: 9999,
            },
          },
        ],
      },
      null,
    ).rows[0];
    expect(row?.beltLoadedShare).toBeCloseTo(0.5);
  });

  it('product issues = damaged + open tape + torn sack + wet + fall-off', () => {
    expect(
      productIssuesOf({ damaged: 1, openTape: 2, tornSack: 3, wetStained: 4, fallOff: 5 }),
    ).toBe(15);
  });

  it('keeps bay order B01 to B07 whatever the input order, and never sorts by value', () => {
    const r = base();
    const { rows } = selectBayRows({ ...r, bays: [...r.bays].reverse() }, 60);
    expect(rows.map((b) => b.bay)).toEqual(['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07']);
  });

  it('totals add the columns; occupancy total is the depot headline; absent avgOccupancyMin is null', () => {
    const r = base();
    const bays = r.bays.map((b, i) => ({
      ...b,
      avgOccupancyMin: i === 0 ? undefined : b.avgOccupancyMin,
    }));
    const { rows, totals } = selectBayRows({ ...r, bays }, 64);
    expect(rows[0]?.avgOccupancyMin).toBeNull();
    expect(totals.casesOut).toBe(r.bays.reduce((s, b) => s + b.casesOut, 0));
    expect(totals.casesIn).toBe(r.bays.reduce((s, b) => s + b.casesIn, 0));
    expect(totals.trucks).toBe(r.bays.reduce((s, b) => s + b.trucks, 0));
    expect(totals.detentions).toBe(r.bays.reduce((s, b) => s + b.detentions, 0));
    expect(totals.productIssues).toBe(r.bays.reduce((s, b) => s + productIssuesOf(b), 0));
    expect(totals.ppe).toBe(r.bays.reduce((s, b) => s + b.ppe, 0));
    expect(totals.avgOccupancyMin).toBe(64);
    const sec = r.bays.reduce(
      (s, b) => ({
        l: s.l + b.beltSec.runningLoaded,
        d: s.d + b.beltSec.runningLoaded + b.beltSec.runningEmpty + b.beltSec.stopped,
      }),
      { l: 0, d: 0 },
    );
    expect(totals.beltLoadedShare).toBeCloseTo(sec.l / sec.d);
  });

  it('a depot with no truck-time has a null total share, not NaN', () => {
    const r = base();
    const zero = r.bays.map((b) => ({
      ...b,
      beltSec: { runningLoaded: 0, runningEmpty: 0, stopped: 0, noTruck: 100, offline: 0 },
    }));
    const { rows, totals } = selectBayRows({ ...r, bays: zero }, null);
    expect(totals.beltLoadedShare).toBeNull();
    expect(rows.every((b) => b.beltLoadedShare === null)).toBe(true);
  });
});

describe('truck log', () => {
  const visit = (id: string, arrivedAt: string, departedAt: string | null): Visit => {
    const v = base().visits.find((x) => x.departedAt !== null);
    if (!v) throw new Error('fixture');
    return {
      ...v,
      visitId: id,
      arrivedAt,
      dockedAt: arrivedAt,
      departedAt,
      dwell: { ...v.dwell, waitForDockMin: null, occupancyMin: null },
    };
  };

  it('lists finished visits only, in arrival order, ties by visit id', () => {
    const rows = selectTruckLog([
      visit('V-3', '2026-10-24T10:00:00+06:00', '2026-10-24T11:00:00+06:00'),
      visit('V-2', '2026-10-24T09:00:00+06:00', '2026-10-24T12:00:00+06:00'),
      visit('V-1', '2026-10-24T10:00:00+06:00', '2026-10-24T10:30:00+06:00'),
      visit('V-4', '2026-10-24T08:00:00+06:00', null),
    ]);
    expect(rows.map((r) => r.visitId)).toEqual(['V-2', 'V-1', 'V-3']);
  });

  it('derives wait and occupancy from the timestamps when the dwell fields are absent', () => {
    const v = visit('V-1', '2026-10-24T10:00:00+06:00', '2026-10-24T11:30:00+06:00');
    const [row] = selectTruckLog([v]);
    expect(row?.waitForDockMin).toBe(0);
    expect(row?.occupancyMin).toBe(90);
  });

  it('counts cartons on the visit direction', () => {
    const v = visit('V-1', '2026-10-24T10:00:00+06:00', '2026-10-24T11:30:00+06:00');
    const rows = selectTruckLog([
      { ...v, visitId: 'a', dir: 'OUT', casesOut: 5, casesIn: 2 },
      { ...v, visitId: 'b', dir: 'IN', casesOut: 5, casesIn: 2 },
      { ...v, visitId: 'c', dir: 'MIXED', casesOut: 5, casesIn: 2 },
    ]);
    expect(rows.map((r) => r.cartons)).toEqual([5, 2, 7]);
  });
});

describe('evidence, SKU, captains, empty', () => {
  it('evidence: at most five events with a snapshot, most severe first, role-visible', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      ev({
        id: `M0000${i}`,
        media: true,
        sev: i < 2 ? 'critical' : 'warn',
        ts: `2026-10-24T1${i}:00:00+06:00`,
      }),
    );
    const noPic = ev({ id: 'N00001', media: false, sev: 'critical' });
    const sec = ev({
      id: 'S00001',
      media: true,
      sev: 'critical',
      category: 'security',
      type: 'door_open_idle',
    });
    const r = withEvents(base(), [noPic, sec, ...many]);
    const hq = selectEvidence(r, 'HQ_VIEWER');
    expect(hq).toHaveLength(5);
    expect(hq.map((e) => e.id).slice(0, 2)).toEqual(['M00001', 'M00000']);
    expect(hq.some((e) => e.id === 'N00001' || e.id === 'S00001')).toBe(false);
    expect(selectEvidence(r, 'DC_MANAGER').some((e) => e.id === 'S00001')).toBe(true);
  });

  const sku = (code: string, count: number): SkuRow => ({
    sku: code,
    name: null,
    pack: 'CASE',
    count,
    avgConf: 0.9,
  });

  it('SKU: top eight by count, unknown excluded from the list and shared out of all counted', () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => sku(`S${i}`, 10 + i)),
      sku('UNKNOWN', 100),
    ];
    const s = selectSku(rows);
    expect(s.rows).toHaveLength(8);
    expect(s.rows[0]?.sku).toBe('S9');
    expect(s.rows.some((r) => r.sku === 'UNKNOWN')).toBe(false);
    const total = rows.reduce((t, r) => t + r.count, 0);
    expect(s.unknownSharePct).toBeCloseTo((100 / total) * 100);
  });

  it('SKU: nothing counted gives a null share', () => {
    expect(selectSku([]).unknownSharePct).toBeNull();
    expect(selectSku([sku('UNKNOWN', 0)]).unknownSharePct).toBeNull();
  });

  const cap = (id: string, en: string | null, bays: string[], rank: number): LeaderboardRow => {
    const proto = base().captains[0];
    if (!proto) throw new Error('fixture');
    return { ...proto, employeeId: id, name: en ? { en, bn: en } : null, bays, rank };
  };

  it('captains: only for roles that may see names, in bay order, no rank or score', () => {
    const rows = [
      cap('E2', 'Zed', ['B05', 'B04'], 1),
      cap('E1', 'Amy', ['B01'], 2),
      cap('E3', null, ['B02'], 3),
    ];
    expect(selectCaptains(rows, 'HQ_VIEWER')).toEqual([]);
    expect(selectCaptains(rows, 'KIOSK')).toEqual([]);
    const out = selectCaptains(rows, 'DC_MANAGER');
    expect(out.map((c) => c.name.en)).toEqual(['Amy', 'Zed']);
    expect(out[1]?.bays).toEqual(['B04', 'B05']);
    expect(Object.keys(out[0] ?? {}).sort()).toEqual(['bays', 'employeeId', 'name']);
    expect(selectCaptains(rows, 'SHIFT_SUPERVISOR')).toHaveLength(2);
    expect(selectCaptains(rows, 'ADMIN')).toHaveLength(2);
  });

  it('isEmptyReport: no cartons, no visits, no events', () => {
    const r = base();
    expect(isEmptyReport(r)).toBe(false);
    expect(
      isEmptyReport({
        ...r,
        kpi: { ...r.kpi, casesOut: 0, casesIn: 0 },
        visits: [],
        topEvents: [],
      }),
    ).toBe(true);
  });
});
