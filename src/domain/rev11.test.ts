// @vitest-environment node
import { describe, expect, it } from 'vitest';
import bayState from './fixtures/bay-state.json';
import siteState from './fixtures/site-state.json';
import { TurnaroundSchema, VisitSchema } from './schemas';
import { REMOVE, mutate } from './testing';
import { safeParseMessage } from './validate';

// Contract rev 1.1 (docs/03 section 6): additive. Payloads with AND without the new fields must parse.

const site = (raw: unknown) => safeParseMessage('siteState', raw);
const bay = (raw: unknown) => safeParseMessage('bayState', raw);

const ALL_NULL = {
  n: 0,
  occupancyMin: null,
  depotTatMin: null,
  waitForDockMin: null,
  preOpDelayMin: null,
  activeMin: null,
  postOpDelayMin: null,
};

describe('SiteState.kpi.turnaround (rev 1.1)', () => {
  it('parses the fixture and keeps the breakdown', () => {
    const r = site(siteState);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.kpi.turnaround?.occupancyMin).toBe(52);
  });

  it('parses an older payload without turnaround (field absent) and with turnaround null', () => {
    const absent = site(mutate(siteState, ['kpi', 'turnaround'], REMOVE));
    expect(absent.ok).toBe(true);
    if (absent.ok) expect(absent.value.kpi.turnaround).toBeUndefined();
    expect(site(mutate(siteState, ['kpi', 'turnaround'], null)).ok).toBe(true);
  });

  it('accepts an empty day (n = 0, all null) and rejects n = 0 with a value', () => {
    expect(site(mutate(siteState, ['kpi', 'turnaround'], ALL_NULL)).ok).toBe(true);
    expect(TurnaroundSchema.safeParse({ ...ALL_NULL, activeMin: 12 }).success).toBe(false);
  });

  it('each mean may be null when n > 0 (no sample visit has both timestamps)', () => {
    for (const key of Object.keys(ALL_NULL).filter((k) => k !== 'n')) {
      expect(site(mutate(siteState, ['kpi', 'turnaround', key], null)).ok).toBe(true);
    }
  });

  it('rejects a missing mean, a negative mean and a fractional n', () => {
    expect(site(mutate(siteState, ['kpi', 'turnaround', 'activeMin'], REMOVE)).ok).toBe(false);
    expect(site(mutate(siteState, ['kpi', 'turnaround', 'activeMin'], -1)).ok).toBe(false);
    expect(site(mutate(siteState, ['kpi', 'turnaround', 'n'], 2.5)).ok).toBe(false);
  });

  it('the fixture satisfies the identities and depotTatMin = avgTatMin', () => {
    const t = siteState.kpi.turnaround;
    expect(t.depotTatMin).toBe(siteState.kpi.avgTatMin);
    expect(t.preOpDelayMin + t.activeMin + t.postOpDelayMin).toBe(t.occupancyMin);
    expect(t.waitForDockMin + t.occupancyMin).toBe(t.depotTatMin);
  });
});

describe('BayState.visit.skuCount (rev 1.1)', () => {
  it('parses with a count, with null and without the field', () => {
    expect(bay(bayState).ok).toBe(true);
    expect(bay(mutate(bayState, ['visit', 'skuCount'], null)).ok).toBe(true);
    const absent = bay(mutate(bayState, ['visit', 'skuCount'], REMOVE));
    expect(absent.ok).toBe(true);
    if (absent.ok) expect(absent.value.visit?.skuCount).toBeUndefined();
  });

  it('rejects a negative or fractional count', () => {
    expect(bay(mutate(bayState, ['visit', 'skuCount'], -1)).ok).toBe(false);
    expect(bay(mutate(bayState, ['visit', 'skuCount'], 1.5)).ok).toBe(false);
  });

  it('the fixture count covers every recognised SKU in skuTop', () => {
    const known = bayState.visit.skuTop.filter((s) => s.sku !== 'UNKNOWN').length;
    expect(bayState.visit.skuCount).toBeGreaterThanOrEqual(known);
  });
});

describe('Visit.dwell (rev 1.1)', () => {
  const visit = {
    visitId: 'V-20261024-B02-0007',
    site: 'dhk-depot',
    bay: 'B02',
    plate: { bn: 'ঢাকা মেট্রো-ড ১১-২১৭১', en: 'DHAKA METRO-DA 11-2171', conf: 0.93 },
    agency: null,
    dir: 'OUT',
    phase: 'DEPARTED',
    arrivedAt: '2026-10-24T19:00:00+06:00',
    dockedAt: '2026-10-24T19:10:00+06:00',
    startedAt: '2026-10-24T19:15:00+06:00',
    finishedAt: '2026-10-24T19:55:00+06:00',
    departedAt: '2026-10-24T20:00:00+06:00',
    dwell: { waitToStartMin: 15, activeMin: 40, postLoadMin: 5, totalMin: 60 },
    casesOut: 400,
    casesIn: 0,
    expected: null,
    hygiene: { damaged: 0, openTape: 0, tornSack: 0, wetStained: 0, fallOff: 0 },
    sku: [],
    captain: null,
    eventIds: [],
    detention: false,
  };

  it('parses an older Visit without the new dwell fields', () => {
    const r = VisitSchema.safeParse(visit);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.dwell.preOpMin).toBeUndefined();
  });

  it('parses the new fields, numbers or null', () => {
    const withNew = {
      ...visit,
      dwell: { ...visit.dwell, waitForDockMin: 10, preOpMin: 5, occupancyMin: 50 },
    };
    const r = VisitSchema.safeParse(withNew);
    expect(r.success).toBe(true);
    if (r.success)
      expect(r.data.dwell).toMatchObject({ waitForDockMin: 10, preOpMin: 5, occupancyMin: 50 });
    const nulls = {
      ...visit,
      dwell: { ...visit.dwell, waitForDockMin: null, preOpMin: null, occupancyMin: null },
    };
    expect(VisitSchema.safeParse(nulls).success).toBe(true);
    expect(
      VisitSchema.safeParse({ ...visit, dwell: { ...visit.dwell, preOpMin: -2 } }).success,
    ).toBe(false);
  });
});
