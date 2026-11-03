import { describe, expect, it } from 'vitest';
import { EVENT_REGISTRY, type BayState, type BayVisit, type Severity } from '@/domain';
import { makeBay, makeSite } from '@/stores/testUtils';
import {
  ALERT_GROUP_IDS,
  ALERT_GROUPS,
  alertGroupOf,
  matchesAlertGroup,
  phaseShares,
  selectAlertGroups,
  selectAttention,
  selectRates,
  selectTurnaround,
  selectWorstPpeBay,
  visitTimeline,
  workKindOf,
} from './selectors';

const TS = '2026-10-24T19:50:45.120+06:00';
const MIN = 60_000;
const at = (hhmm: string) => `2026-10-24T${hhmm}:00+06:00`;
const ms = (hhmm: string) => Date.parse(at(hhmm));

const belt = (
  bay: string,
  status: BayState['belt']['status'],
  direction: BayState['belt']['direction'],
  rateCpm: number,
) =>
  makeBay(bay, TS, (b) => {
    b.belt.status = status;
    b.belt.direction = direction;
    b.belt.rateCpm = rateCpm;
  });

describe('selectRates', () => {
  it('sums rateCpm x 60 per direction; NONE counts in neither', () => {
    const r = selectRates([
      belt('B01', 'RUNNING_LOADED', 'OUT', 14.2),
      belt('B02', 'RUNNING_LOADED', 'OUT', 10),
      belt('B03', 'RUNNING_LOADED', 'IN', 8),
      belt('B04', 'RUNNING_EMPTY', 'NONE', 5),
      belt('B05', 'STOPPED', 'OUT', 0),
    ]);
    expect(r.outPerHour).toBeCloseTo((14.2 + 10) * 60, 6);
    expect(r.inPerHour).toBe(480);
    expect(r.runningBays).toBe(4);
  });

  it('is null in both directions when no belt is RUNNING_*', () => {
    expect(
      selectRates([belt('B01', 'STOPPED', 'OUT', 0), belt('B02', 'NO_TRUCK', 'NONE', 0)]),
    ).toEqual({ outPerHour: null, inPerHour: null, runningBays: 0 });
    expect(selectRates([])).toEqual({ outPerHour: null, inPerHour: null, runningBays: 0 });
  });

  it('a running outbound-only depot has 0 inbound, not null', () => {
    expect(selectRates([belt('B01', 'RUNNING_LOADED', 'OUT', 2)]).inPerHour).toBe(0);
  });
});

describe('selectTurnaround', () => {
  it('none before the first SiteState', () => {
    expect(selectTurnaround(null)).toEqual({ kind: 'none' });
  });

  it('full breakdown from kpi.turnaround, with the avgTat delta and the shares', () => {
    const kpi = makeSite(TS).kpi;
    const v = selectTurnaround(kpi);
    expect(v.kind).toBe('full');
    if (v.kind !== 'full') return;
    expect(v).toMatchObject({
      n: 41,
      occupancyMin: 52,
      depotTatMin: 63,
      depotTatDeltaMin: -4,
      waitForDockMin: 11,
      preOpDelayMin: 9,
      activeMin: 38,
      postOpDelayMin: 5,
    });
    // occupancy identity: the three phases add up to the headline
    expect((v.preOpDelayMin ?? 0) + (v.activeMin ?? 0) + (v.postOpDelayMin ?? 0)).toBe(
      v.occupancyMin,
    );
    const s = v.shares;
    expect(s).not.toBeNull();
    if (!s) return;
    expect(s.preOp + s.work + s.postOp).toBeCloseTo(1, 10);
    expect(s.work).toBeCloseTo(38 / 52, 10);
  });

  it('legacy when the backend has no turnaround (absent or null)', () => {
    const kpi = makeSite(TS).kpi;
    delete kpi.turnaround;
    expect(selectTurnaround(kpi)).toEqual({ kind: 'legacy', avgTatMin: 63, avgTatDeltaMin: -4 });
    expect(selectTurnaround({ ...kpi, turnaround: null }).kind).toBe('legacy');
  });

  it('an empty day keeps n = 0 and null values, no shares', () => {
    const kpi = makeSite(TS).kpi;
    kpi.turnaround = {
      n: 0,
      occupancyMin: null,
      depotTatMin: null,
      waitForDockMin: null,
      preOpDelayMin: null,
      activeMin: null,
      postOpDelayMin: null,
    };
    const v = selectTurnaround(kpi);
    expect(v).toMatchObject({ kind: 'full', n: 0, occupancyMin: null, shares: null });
  });
});

describe('phaseShares', () => {
  it('null when a phase is unknown or the total is 0; negatives clamp to 0', () => {
    expect(phaseShares(null, 1, 1)).toBeNull();
    expect(phaseShares(0, 0, 0)).toBeNull();
    expect(phaseShares(-5, 10, 0)).toEqual({ preOp: 0, work: 1, postOp: 0 });
  });
});

describe('selectWorstPpeBay', () => {
  const ppe = (bay: string, n: number) => makeBay(bay, TS, (b) => (b.today.ppe = n));

  it('picks the highest today.ppe, ties to the lowest bay id', () => {
    expect(selectWorstPpeBay([ppe('B01', 2), ppe('B04', 5), ppe('B03', 5)])).toEqual({
      bay: 'B03',
      count: 5,
    });
  });

  it('null when no bay has a violation today', () => {
    expect(selectWorstPpeBay([ppe('B01', 0), ppe('B02', 0)])).toBeNull();
    expect(selectWorstPpeBay([])).toBeNull();
  });
});

describe('ALERT_GROUPS mapping table', () => {
  const EXPECTED: Record<string, string> = {
    'truck.detention': 'delays',
    'belt.empty_run': 'idle',
    'security.door_open_idle': 'idle',
    'staging.pallet_wait': 'throughput',
    'ppe.violation': 'ppe',
    'compliance.on_belt': 'safety',
    'compliance.crowding': 'safety',
    'compliance.forklift_proximity': 'safety',
    'hygiene.damaged': 'hygiene',
    'hygiene.open_tape': 'hygiene',
    'hygiene.torn_sack': 'hygiene',
    'hygiene.wet_stained': 'hygiene',
    'hygiene.spillage': 'hygiene',
    'hygiene.debris': 'hygiene',
    'belt.fall_off': 'hygiene',
    'security.after_hours_presence': 'security',
    'security.truck_entry_no_loading': 'security',
    'system.camera_offline': 'system',
    'system.camera_obstructed': 'system',
    'system.camera_defocus': 'system',
    'system.camera_moved': 'system',
    'system.camera_ok': 'system',
    'system.pipeline_lag': 'system',
    'roster.captain_detected': 'system',
    'roster.captain_absent': 'system',
    // not named by the spec: they fall into Other, never dropped
    'truck.arrived': 'other',
    'truck.docked': 'other',
    'truck.started': 'other',
    'truck.finished': 'other',
    'truck.departed': 'other',
    'truck.unknown_plate': 'other',
    'belt.state_changed': 'other',
    'handling.rough_handling': 'other',
  };

  it('every catalogue type maps to exactly one known group, as specified', () => {
    const actual = Object.fromEntries(
      EVENT_REGISTRY.map((e) => [e.key, alertGroupOf(e.category, e.type)]),
    );
    expect(actual).toEqual(EXPECTED);
    for (const g of Object.values(actual)) expect(ALERT_GROUP_IDS).toContain(g);
  });

  it('the table lists real catalogue keys, each key and category at most once', () => {
    const keys = ALERT_GROUPS.flatMap((g) => g.keys);
    const cats = ALERT_GROUPS.flatMap((g) => g.categories);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(cats).size).toBe(cats.length);
    const catalogue = new Set<string>(EVENT_REGISTRY.map((e) => e.key));
    for (const k of keys) expect(catalogue.has(k)).toBe(true);
    const categories = new Set<string>(EVENT_REGISTRY.map((e) => e.category));
    for (const c of cats) expect(categories.has(c)).toBe(true);
  });

  it('display order is the spec order, Other last', () => {
    expect(ALERT_GROUP_IDS).toEqual([
      'delays',
      'idle',
      'throughput',
      'ppe',
      'safety',
      'hygiene',
      'security',
      'system',
      'other',
    ]);
  });

  it('unknown types fall into Other', () => {
    expect(alertGroupOf('belt', 'low_throughput')).toBe('other');
    expect(alertGroupOf('nope', 'x')).toBe('other');
    expect(matchesAlertGroup({ category: 'security', type: 'door_open_idle' }, 'idle')).toBe(true);
    expect(matchesAlertGroup({ category: 'security', type: 'door_open_idle' }, 'security')).toBe(
      false,
    );
  });
});

describe('selectAlertGroups', () => {
  const ev = (
    key: string,
    sev: Severity,
    status: 'OPEN' | 'ACK' | 'CLOSED' = 'OPEN',
  ): { category: string; type: string; sev: Severity; status: 'OPEN' | 'ACK' | 'CLOSED' } => {
    const [category = '', type = ''] = key.split('.');
    return { category, type, sev, status };
  };

  it('counts per group and severity, sorted by critical then warn', () => {
    const rows = selectAlertGroups([
      ev('ppe.violation', 'warn'),
      ev('ppe.violation', 'warn'),
      ev('ppe.violation', 'warn', 'ACK'),
      ev('compliance.on_belt', 'critical'),
      ev('system.camera_ok', 'info'),
      ev('hygiene.damaged', 'warn'),
      ev('truck.arrived', 'info'),
      ev('belt.fall_off', 'warn'),
      ev('ppe.violation', 'warn', 'CLOSED'),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['safety', 'ppe', 'hygiene', 'system', 'other']);
    expect(rows[0]).toEqual({ id: 'safety', critical: 1, warn: 0, info: 0, total: 1 });
    expect(rows[1]).toEqual({ id: 'ppe', critical: 0, warn: 3, info: 0, total: 3 });
    expect(rows[2]).toMatchObject({ id: 'hygiene', warn: 2 });
  });

  it('ties keep table order; includeEmpty returns all nine rows', () => {
    expect(
      selectAlertGroups([ev('staging.pallet_wait', 'warn'), ev('truck.detention', 'warn')]).map(
        (r) => r.id,
      ),
    ).toEqual(['delays', 'throughput']);
    const all = selectAlertGroups([], { includeEmpty: true });
    expect(all.map((r) => r.id)).toEqual(ALERT_GROUP_IDS);
    expect(all.every((r) => r.total === 0)).toBe(true);
  });

  it('group totals add up to the events passed (nothing dropped)', () => {
    const evts = EVENT_REGISTRY.map((e) => ev(e.key, e.sev));
    const rows = selectAlertGroups(evts);
    expect(rows.reduce((s, r) => s + r.total, 0)).toBe(evts.length);
  });
});

describe('selectAttention', () => {
  it('needs attention = warn + critical; info is shown but never added', () => {
    const kpi = makeSite(TS).kpi;
    kpi.openAlerts = { info: 40, warn: 3, critical: 2 };
    expect(selectAttention(kpi)).toEqual({ needsAttention: 5, critical: 2, warn: 3, info: 40 });
    expect(selectAttention(null)).toBeNull();
  });
});

describe('visitTimeline', () => {
  const base = makeBay('B02', TS).visit as BayVisit;
  const v = (over: Partial<BayVisit>): BayVisit => ({
    ...base,
    arrivedAt: at('19:00'),
    dockedAt: null,
    startedAt: null,
    finishedAt: null,
    departedAt: null,
    ...over,
  });

  it('no segments before docking (phase ARRIVED)', () => {
    const t = visitTimeline(v({ phase: 'ARRIVED' }), ms('19:05'));
    expect(t).toMatchObject({ segments: [], occupancyMin: null, waitForDockMin: null });
  });

  it('DOCKED: pre-op counts up to now', () => {
    const t = visitTimeline(v({ phase: 'DOCKED', dockedAt: at('19:10') }), ms('19:17'));
    expect(t.segments).toEqual([{ id: 'preOp', min: 7, inProgress: true }]);
    expect(t).toMatchObject({ occupancyMin: 7, occupancyInProgress: true, waitForDockMin: 10 });
  });

  it('LOADING: pre-op closed, work in progress; label from the belt direction', () => {
    const visit = v({ phase: 'LOADING', dockedAt: at('19:10'), startedAt: at('19:15') });
    const t = visitTimeline(visit, ms('19:45') + 30_000, 'OUT');
    expect(t.segments).toEqual([
      { id: 'preOp', min: 5, inProgress: false },
      { id: 'work', min: 30.5, inProgress: true },
    ]);
    expect(t.work).toBe('loading');
    expect(visitTimeline(visit, ms('19:45'), 'IN').work).toBe('unloading');
  });

  it('FINISHED: post-op in progress; DEPARTED: everything closed and the identity holds', () => {
    const fin = v({
      phase: 'FINISHED',
      dockedAt: at('19:10'),
      startedAt: at('19:15'),
      finishedAt: at('19:55'),
    });
    const t1 = visitTimeline(fin, ms('20:01'));
    expect(t1.segments.map((s) => [s.id, s.min, s.inProgress])).toEqual([
      ['preOp', 5, false],
      ['work', 40, false],
      ['postOp', 6, true],
    ]);
    const gone = visitTimeline({ ...fin, phase: 'DEPARTED', departedAt: at('20:03') }, ms('21:00'));
    expect(gone.occupancyInProgress).toBe(false);
    expect(gone.occupancyMin).toBe(53);
    expect(gone.segments.reduce((s, x) => s + x.min, 0)).toBe((ms('20:03') - ms('19:10')) / MIN);
    expect(gone.shares?.work).toBeCloseTo(40 / 53, 10);
  });

  it('a missing middle timestamp folds into the previous segment; skew clamps to 0', () => {
    const t = visitTimeline(
      v({ phase: 'DEPARTED', dockedAt: at('19:10'), departedAt: at('19:30') }),
      ms('21:00'),
    );
    expect(t.segments).toEqual([{ id: 'preOp', min: 20, inProgress: false }]);
    expect(t.occupancyMin).toBe(20);
    const skew = visitTimeline(v({ phase: 'DOCKED', dockedAt: at('19:10') }), ms('19:09'));
    expect(skew.segments[0]?.min).toBe(0);
  });

  it('workKindOf falls back to phase, then to counts, when the belt has no direction', () => {
    expect(workKindOf({ phase: 'UNLOADING', casesIn: 0, casesOut: 0 }, 'NONE')).toBe('unloading');
    expect(workKindOf({ phase: 'FINISHED', casesIn: 9, casesOut: 1 }, 'NONE')).toBe('unloading');
    expect(workKindOf({ phase: 'FINISHED', casesIn: 0, casesOut: 9 }, 'NONE')).toBe('loading');
  });
});
