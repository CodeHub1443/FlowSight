// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BayPerformanceSchema, type PackType } from '@/domain';
import { bayPerformance } from './api/analytics';
import { DAY, MIN } from './clock';
import {
  computeBayPerformance,
  dominantPack,
  MIN_INCLUDED,
  quantile,
  type PerfVisit,
} from './perf';
import { makeDepot, PEAK } from './testing';

// GET /analytics/bay-performance from hand-built visits (contract rev 1.2, docs/03 section 4.4).

const BAYS = ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07'];
const T0 = Date.parse('2026-10-24T08:00:00+06:00');
const FROM = Date.parse('2026-10-24T06:00:00+06:00');
const TO = FROM + DAY;

type Spec = {
  bay?: string;
  dir?: PerfVisit['dir'];
  cartons?: number;
  activeMin?: number;
  pack?: PackType;
  packs?: PerfVisit['packs'];
  crew?: number | null;
  wait?: number;
  pre?: number;
  post?: number | null;
  startMin?: number;
  detention?: boolean;
};

/** A finished visit: arrive, wait, pre-op, `activeMin` of work, then post-op (null = not departed yet). */
function visit(s: Spec = {}): PerfVisit {
  const dir = s.dir ?? 'OUT';
  const cartons = s.cartons ?? 100;
  const arrivedAt = T0 + (s.startMin ?? 0) * MIN;
  const dockedAt = arrivedAt + (s.wait ?? 5) * MIN;
  const startedAt = dockedAt + (s.pre ?? 10) * MIN;
  const finishedAt = startedAt + (s.activeMin ?? 10) * MIN;
  const post = s.post === undefined ? 5 : s.post;
  return {
    bay: s.bay ?? 'B01',
    dir,
    arrivedAt,
    dockedAt,
    startedAt,
    finishedAt,
    departedAt: post === null ? null : finishedAt + post * MIN,
    casesOut: dir === 'IN' ? 0 : cartons,
    casesIn: dir === 'IN' ? cartons : 0,
    packs: s.packs ?? [{ pack: s.pack ?? 'CASE', count: cartons }],
    crew: s.crew === undefined ? 6 : s.crew,
    detention: s.detention ?? false,
  };
}

const many = (n: number, s: Spec): PerfVisit[] => Array.from({ length: n }, () => visit(s));
const run = (visits: PerfVisit[], minIncluded?: number) =>
  computeBayPerformance(visits, {
    bays: BAYS,
    from: FROM,
    to: TO,
    ...(minIncluded === undefined ? {} : { minIncluded }),
  });
const row = (res: ReturnType<typeof run>, bay: string) => {
  const r = res.rows.find((x) => x.bay === bay);
  if (!r) throw new Error(`no row ${bay}`);
  return r;
};

describe('quantile and dominant pack', () => {
  it('interpolates linearly like percentile_cont', () => {
    expect(quantile([], 0.5)).toBeNull();
    expect(quantile([7], 0.9)).toBe(7);
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([100, 200, 300, 400], 1 / 3)).toBeCloseTo(200, 9);
    expect(quantile([0, 300], 2 / 3)).toBeCloseTo(200, 9);
  });

  it('needs more than half of the counted cartons, else MIXED', () => {
    expect(
      dominantPack([
        { pack: 'SACK', count: 51 },
        { pack: 'CASE', count: 49 },
      ]),
    ).toBe('SACK');
    expect(
      dominantPack([
        { pack: 'SACK', count: 50 },
        { pack: 'CASE', count: 50 },
      ]),
    ).toBe('MIXED');
    expect(
      dominantPack([
        { pack: 'CASE', count: 40 },
        { pack: 'SACK', count: 30 },
        { pack: 'SHRINK', count: 30 },
      ]),
    ).toBe('MIXED');
    // the same pack under two SKU codes adds up
    expect(
      dominantPack([
        { pack: 'CASE', count: 30 },
        { pack: 'SACK', count: 40 },
        { pack: 'CASE', count: 31 },
      ]),
    ).toBe('CASE');
    expect(dominantPack([])).toBe('MIXED');
  });
});

describe('computeBayPerformance', () => {
  it('a bay taking 25 % longer for the same cohort and volume gets the arithmetic indices', () => {
    // 8 + 8 units of 100 OUT cartons: one cohort, median speed (10 + 12.5) / 2 = 11.25 min per 100
    const res = run([
      ...many(8, { bay: 'B01', activeMin: 10 }),
      ...many(8, { bay: 'B02', activeMin: 12.5 }),
    ]);
    expect(BayPerformanceSchema.safeParse(res).success).toBe(true);
    expect(res.cohorts).toEqual([
      { key: 'OUT.CASE.1', dir: 'OUT', pack: 'CASE', band: 1, n: 16, medianMinPer100: 11.25 },
    ]);
    const a = row(res, 'B01');
    const b = row(res, 'B02');
    expect(a.index).toBe(112.5); // 100 x (8 x 11.25) / 80
    expect(b.index).toBe(90); // 100 x (8 x 11.25) / 100
    expect((a.index ?? 0) / (b.index ?? 1)).toBeCloseTo(1.25, 9);
    expect(a.confidence).toBe('OK');
    expect(a.included).toBe(8);
    expect(a.minPer100Cartons).toBe(10);
    expect(b.minPer100Cartons).toBe(12.5);
    expect(a.cartonsPerLoadingHour).toBe(600); // 800 cartons / (80 / 60) h
  });

  it('one bay alone in its cohort scores 100 whatever its speed', () => {
    const res = run(many(8, { bay: 'B03', activeMin: 37 }));
    expect(row(res, 'B03').index).toBe(100);
  });

  it('splits a group into three volume bands at the terciles', () => {
    // cartons 100..1800: q1 = 666.7, q2 = 1233.3, so 6 / 6 / 6
    const visits = Array.from({ length: 18 }, (_, i) =>
      visit({ bay: BAYS[i % 7], cartons: (i + 1) * 100, activeMin: (i + 1) * 10 }),
    );
    const res = run(visits);
    expect(res.cohorts.map((c) => [c.key, c.band, c.n])).toEqual([
      ['OUT.CASE.1', 1, 6],
      ['OUT.CASE.2', 2, 6],
      ['OUT.CASE.3', 3, 6],
    ]);
  });

  it('merges the bands of a group when one band is under 6, and drops a merged cohort under 6', () => {
    // 9 SACK units: bands 3 / 3 / 3, so they merge into OUT.SACK.all (n 9)
    const sacks = Array.from({ length: 9 }, (_, i) =>
      visit({ bay: 'B01', pack: 'SACK', cartons: (i + 1) * 100, activeMin: (i + 1) * 12 }),
    );
    // 5 IN units: merged and still under 6, so excluded from the index
    const ins = many(5, { bay: 'B02', dir: 'IN', cartons: 300, activeMin: 30 });
    const res = run([...sacks, ...ins]);
    expect(res.cohorts).toEqual([
      { key: 'OUT.SACK.all', dir: 'OUT', pack: 'SACK', band: null, n: 9, medianMinPer100: 12 },
    ]);
    expect(row(res, 'B01').included).toBe(9);
    expect(row(res, 'B01').index).toBe(100);
    expect(row(res, 'B02').visits).toBe(5);
    expect(row(res, 'B02').included).toBe(0);
    expect(row(res, 'B02').index).toBeNull();
    expect(row(res, 'B02').confidence).toBe('NONE');
  });

  it('keeps a band merge from leaking across direction or pack', () => {
    const res = run([
      ...many(6, { pack: 'CASE' }),
      ...many(6, { pack: 'SACK' }),
      ...many(6, { dir: 'IN' }),
    ]);
    expect(res.cohorts.map((c) => c.key)).toEqual(['IN.CASE.1', 'OUT.CASE.1', 'OUT.SACK.1']);
  });

  it('confidence: OK from minIncluded, LOW from 4, NONE under 4 (index null)', () => {
    const pad = many(10, { bay: 'B07' });
    const res = run([
      ...pad,
      ...many(8, { bay: 'B01' }),
      ...many(7, { bay: 'B02' }),
      ...many(4, { bay: 'B03' }),
      ...many(3, { bay: 'B04' }),
    ]);
    expect(res.minIncluded).toBe(MIN_INCLUDED);
    expect(['B01', 'B02', 'B03', 'B04'].map((b) => row(res, b).confidence)).toEqual([
      'OK',
      'LOW',
      'LOW',
      'NONE',
    ]);
    expect(row(res, 'B03').index).toBe(100);
    expect(row(res, 'B04').index).toBeNull();
    expect(row(res, 'B04').included).toBe(3);
    // minIncluded is a parameter
    expect(row(run(many(6, { bay: 'B01' }), 6), 'B01').confidence).toBe('OK');
  });

  it('MIXED-direction visits count as visits but never in the index', () => {
    const mixed: PerfVisit = { ...visit({ bay: 'B01' }), dir: 'MIXED', casesOut: 50, casesIn: 50 };
    const res = run([...many(8, { bay: 'B01' }), mixed]);
    expect(row(res, 'B01').visits).toBe(9);
    expect(row(res, 'B01').included).toBe(8);
    expect(row(res, 'B01').cartonsOut).toBe(850);
    expect(row(res, 'B01').cartonsIn).toBe(50);
    expect(res.cohorts.reduce((s, c) => s + c.n, 0)).toBe(8);
  });

  it('an empty range: one empty row per bay, null medians, no cohorts', () => {
    const late = many(8, { startMin: 2 * 24 * 60 }); // finishes after `to`
    const res = run(late);
    expect(BayPerformanceSchema.safeParse(res).success).toBe(true);
    expect(res.rows.map((r) => r.bay)).toEqual(BAYS);
    expect(res.cohorts).toEqual([]);
    expect(res.site).toEqual({
      visits: 0,
      medianOccupancyMin: null,
      medianPreOpMin: null,
      medianPostOpMin: null,
    });
    for (const r of res.rows) {
      expect(r).toMatchObject({
        visits: 0,
        included: 0,
        index: null,
        confidence: 'NONE',
        detentions: 0,
      });
      expect(Object.values(r.mean).every((v) => v === null)).toBe(true);
      expect(r.cartonsPerLoadingHour).toBeNull();
      expect(r.avgCrew).toBeNull();
    }
    expect(res.from).toBe('2026-10-24T06:00:00.000+06:00');
  });

  it('a bay with no visits keeps its row, in bay order', () => {
    const res = run([...many(8, { bay: 'B07' }), ...many(8, { bay: 'B01' })]);
    expect(res.rows.map((r) => r.bay)).toEqual(BAYS);
    expect(row(res, 'B04')).toMatchObject({ visits: 0, index: null, confidence: 'NONE' });
  });

  it('a visit with null timestamps: unfinished ones are out, a finish without a start counts but is not compared', () => {
    const unfinished: PerfVisit = { ...visit(), finishedAt: null, departedAt: null };
    const noStart: PerfVisit = { ...visit({ bay: 'B02' }), startedAt: null };
    const noDock: PerfVisit = { ...visit({ bay: 'B02' }), dockedAt: null };
    const res = run([unfinished, noStart, noDock, ...many(8, { bay: 'B03' })]);
    expect(row(res, 'B01').visits).toBe(0);
    const b2 = row(res, 'B02');
    expect(b2.visits).toBe(2);
    expect(b2.included).toBe(1); // noDock still has start and finish
    expect(b2.mean.activeMin).toBe(10); // only noDock has both timestamps
    expect(b2.mean.preOpMin).toBeNull(); // each lacks one of dockedAt, startedAt
    expect(b2.mean.occupancyMin).toBe(25); // noStart: 10 + 10 + 5 measured dock to departure
    expect(b2.mean.waitForDockMin).toBe(5);
    expect(BayPerformanceSchema.safeParse(res).success).toBe(true);
  });

  it('means, site medians, detentions and loading-time-weighted crew', () => {
    const res = run([
      visit({
        bay: 'B01',
        wait: 4,
        pre: 10,
        activeMin: 60,
        post: 6,
        cartons: 600,
        crew: 4,
        detention: true,
      }),
      visit({ bay: 'B01', wait: 8, pre: 20, activeMin: 30, post: null, cartons: 300, crew: 10 }),
      visit({ bay: 'B02', wait: 2, pre: 4, activeMin: 30, post: 2, cartons: 300, crew: null }),
    ]);
    const b1 = row(res, 'B01');
    expect(b1.mean).toEqual({
      occupancyMin: 76,
      waitForDockMin: 6,
      preOpMin: 15,
      activeMin: 45,
      postOpMin: 6,
    });
    expect(b1.detentions).toBe(1);
    // (4 x 60 + 10 x 30) / 90 = 6 people; 900 cartons / (6 x 1.5 h) = 100 per crew-hour
    expect(b1.avgCrew).toBe(6);
    expect(b1.cartonsPerCrewHour).toBe(100);
    expect(b1.cartonsPerLoadingHour).toBe(600);
    expect(row(res, 'B02').avgCrew).toBeNull();
    expect(row(res, 'B02').cartonsPerCrewHour).toBeNull();
    expect(res.site).toEqual({
      visits: 3,
      medianOccupancyMin: 56,
      medianPreOpMin: 10,
      medianPostOpMin: 4,
    });
  });
});

describe('simulator bay-performance', () => {
  it('a simulated day is contract-valid, one row per configured bay, cohort n = included', () => {
    const d = makeDepot(3, PEAK, 2);
    const from = d.clock.businessDayStart(d.now);
    const res = bayPerformance(d, from, d.now);
    expect(BayPerformanceSchema.safeParse(res).success).toBe(true);
    expect(res.rows.map((r) => r.bay)).toEqual(d.bays.map((b) => b.id));
    expect(res.cohorts.reduce((s, c) => s + c.n, 0)).toBe(
      res.rows.reduce((s, r) => s + r.included, 0),
    );
    expect(res.site.visits).toBe(res.rows.reduce((s, r) => s + r.visits, 0));
    expect(res.site.visits).toBeGreaterThan(0);
  });
});
