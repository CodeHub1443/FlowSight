import type {
  BayPerfRow,
  BayPerformance,
  PackType,
  PerfCohort,
  PerfConfidence,
  PerfPack,
} from '@/domain';
import { perfConfidenceOf } from '@/domain';
import { iso, MIN } from './clock';
import { round } from './rng';

// GET /analytics/bay-performance (contract rev 1.2, docs/03 section 4.4), computed from the simulator's own visits.
// Pure: hand-built visits in, the response out. The numbered comments refer to the definitions in docs/03 section 4.4.

/** Default `minIncluded` (definition 9). */
export const MIN_INCLUDED = 8;
/** Smallest cohort that is used (definition 5). */
export const MIN_COHORT = 6;

/** The visit fields the comparison needs. Times are epoch ms. */
export interface PerfVisit {
  bay: string;
  dir: 'OUT' | 'IN' | 'MIXED';
  arrivedAt: number;
  dockedAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  departedAt: number | null;
  casesOut: number;
  casesIn: number;
  /** `sku[]` reduced to pack and count. */
  packs: readonly { pack: PackType; count: number }[];
  /** People detected in the bay while loading/unloading; null when unknown. */
  crew: number | null;
  detention: boolean;
}

export interface BayPerformanceOptions {
  /** Configured bays, in bay order: one row each. */
  bays: readonly string[];
  from: number;
  to: number;
  minIncluded?: number;
}

type Unit = {
  bay: string;
  dir: 'OUT' | 'IN';
  pack: PerfPack;
  cartons: number;
  activeMin: number;
  cohort: string | null;
};

/** Quantile with linear interpolation between order statistics (Postgres `percentile_cont`). `sorted` ascending. */
export function quantile(sorted: readonly number[], p: number): number | null {
  const n = sorted.length;
  if (n === 0) return null;
  const h = (n - 1) * p;
  const lo = Math.floor(h);
  const a = sorted[lo] ?? 0;
  const b = sorted[Math.min(n - 1, lo + 1)] ?? a;
  return a + (h - lo) * (b - a);
}

export const median = (values: readonly number[]): number | null =>
  quantile(
    [...values].sort((x, y) => x - y),
    0.5,
  );

const mean = (values: readonly number[]): number | null =>
  values.length === 0 ? null : values.reduce((s, x) => s + x, 0) / values.length;

const r1 = (v: number | null): number | null => (v === null ? null : round(v, 1));
const span = (a: number | null, b: number | null): number | null =>
  a === null || b === null ? null : (b - a) / MIN;

/** Definition 3: the pack holding more than half of the counted cartons, else MIXED. */
export function dominantPack(packs: readonly { pack: PackType; count: number }[]): PerfPack {
  const byPack = new Map<PackType, number>();
  let total = 0;
  for (const p of packs) {
    if (p.count <= 0) continue;
    byPack.set(p.pack, (byPack.get(p.pack) ?? 0) + p.count);
    total += p.count;
  }
  for (const [pack, count] of byPack) if (count * 2 > total) return pack;
  return 'MIXED';
}

/** Definition 2: the index unit of a visit in range, or null when the visit is not comparable. */
function unitOf(v: PerfVisit): Unit | null {
  if (v.dir === 'MIXED') return null;
  const activeMin = span(v.startedAt, v.finishedAt);
  if (activeMin === null || activeMin <= 0) return null;
  const cartons = v.dir === 'OUT' ? v.casesOut : v.casesIn;
  if (cartons <= 0) return null;
  return { bay: v.bay, dir: v.dir, pack: dominantPack(v.packs), cartons, activeMin, cohort: null };
}

const speedOf = (u: Unit): number => (u.activeMin / u.cartons) * 100;

/** Definitions 4 to 6: assigns `cohort` on each unit (null = excluded) and returns the cohorts used, ordered by key. */
function buildCohorts(units: Unit[]): PerfCohort[] {
  const groups = new Map<string, Unit[]>();
  for (const u of units) {
    const k = `${u.dir}.${u.pack}`;
    const g = groups.get(k);
    if (g) g.push(u);
    else groups.set(k, [u]);
  }
  const cohorts: PerfCohort[] = [];
  const add = (dir: 'OUT' | 'IN', pack: PerfPack, band: 1 | 2 | 3 | null, members: Unit[]) => {
    const key = `${dir}.${pack}.${band ?? 'all'}`;
    for (const u of members) u.cohort = key;
    cohorts.push({
      key,
      dir,
      pack,
      band,
      n: members.length,
      medianMinPer100: median(members.map(speedOf)) ?? 0,
    });
  };
  for (const members of groups.values()) {
    const first = members[0];
    if (!first) continue;
    const sorted = members.map((u) => u.cartons).sort((a, b) => a - b);
    const q1 = quantile(sorted, 1 / 3) ?? 0;
    const q2 = quantile(sorted, 2 / 3) ?? 0;
    const bands: [Unit[], Unit[], Unit[]] = [[], [], []];
    for (const u of members) bands[u.cartons <= q1 ? 0 : u.cartons <= q2 ? 1 : 2].push(u);
    const tooSmall = bands.some((b) => b.length > 0 && b.length < MIN_COHORT);
    if (!tooSmall) {
      bands.forEach((b, i) => {
        if (b.length > 0) add(first.dir, first.pack, (i + 1) as 1 | 2 | 3, b);
      });
    } else if (members.length >= MIN_COHORT) {
      add(first.dir, first.pack, null, members);
    }
    // else: still under MIN_COHORT after merging, so these units stay out of the index (cohort null)
  }
  cohorts.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return cohorts;
}

function emptyRow(bay: string): BayPerfRow {
  return {
    bay,
    visits: 0,
    included: 0,
    cartonsOut: 0,
    cartonsIn: 0,
    cartonsPerLoadingHour: null,
    minPer100Cartons: null,
    avgCrew: null,
    cartonsPerCrewHour: null,
    mean: {
      occupancyMin: null,
      waitForDockMin: null,
      preOpMin: null,
      activeMin: null,
      postOpMin: null,
    },
    detentions: 0,
    index: null,
    confidence: 'NONE',
  };
}

const notNull = (xs: readonly (number | null)[]): number[] =>
  xs.filter((x): x is number => x !== null);

/** The whole response for [from, to). */
export function computeBayPerformance(
  visits: Iterable<PerfVisit>,
  opts: BayPerformanceOptions,
): BayPerformance {
  const minIncluded = opts.minIncluded ?? MIN_INCLUDED;
  // 1. visits in range
  const inRange: PerfVisit[] = [];
  for (const v of visits) {
    if (v.finishedAt !== null && v.finishedAt >= opts.from && v.finishedAt < opts.to)
      inRange.push(v);
  }
  // 2-7. units, cohorts, expected minutes
  const units = inRange.map(unitOf).filter((u): u is Unit => u !== null);
  const cohorts = buildCohorts(units);
  const speed = new Map(cohorts.map((c) => [c.key, c.medianMinPer100]));

  const byBay = new Map<string, PerfVisit[]>();
  for (const v of inRange) {
    const list = byBay.get(v.bay);
    if (list) list.push(v);
    else byBay.set(v.bay, [v]);
  }

  const rows = opts.bays.map((bay): BayPerfRow => {
    const list = byBay.get(bay) ?? [];
    if (list.length === 0) return emptyRow(bay);
    // 8-9. index and confidence
    let expected = 0;
    let actual = 0;
    let included = 0;
    for (const u of units) {
      if (u.bay !== bay || u.cohort === null) continue;
      const med = speed.get(u.cohort);
      if (med === undefined) continue;
      expected += (u.cartons / 100) * med;
      actual += u.activeMin;
      included += 1;
    }
    const confidence: PerfConfidence = perfConfidenceOf(included, minIncluded);
    const index = confidence === 'NONE' || actual <= 0 ? null : round((100 * expected) / actual, 1);

    // 12. rates over visits with an active time
    let a = 0;
    let c = 0;
    let crewMin = 0;
    let crewActive = 0;
    let crewCartons = 0;
    for (const v of list) {
      const act = span(v.startedAt, v.finishedAt);
      if (act === null || act <= 0) continue;
      const cartons = v.casesOut + v.casesIn;
      a += act;
      c += cartons;
      if (v.crew !== null && v.crew > 0) {
        crewMin += v.crew * act;
        crewActive += act;
        crewCartons += cartons;
      }
    }
    const avgCrew = crewActive > 0 ? crewMin / crewActive : null;

    // 10. means per field
    const m = (f: (v: PerfVisit) => number | null) => r1(mean(notNull(list.map(f))));
    return {
      bay,
      visits: list.length,
      included,
      cartonsOut: list.reduce((s, v) => s + v.casesOut, 0),
      cartonsIn: list.reduce((s, v) => s + v.casesIn, 0),
      cartonsPerLoadingHour: a > 0 ? round(c / (a / 60), 1) : null,
      minPer100Cartons: c > 0 ? round((a / c) * 100, 1) : null,
      avgCrew: r1(avgCrew),
      // crewMin / 60 = avgCrew x active hours of the visits with a crew count
      cartonsPerCrewHour: crewMin > 0 ? round(crewCartons / (crewMin / 60), 1) : null,
      mean: {
        occupancyMin: m((v) => span(v.dockedAt, v.departedAt)),
        waitForDockMin: m((v) => span(v.arrivedAt, v.dockedAt)),
        preOpMin: m((v) => span(v.dockedAt, v.startedAt)),
        activeMin: m((v) => span(v.startedAt, v.finishedAt)),
        postOpMin: m((v) => span(v.finishedAt, v.departedAt)),
      },
      // 13
      detentions: list.filter((v) => v.detention).length,
      index,
      confidence,
    };
  });

  // 11. site block
  const med = (f: (v: PerfVisit) => number | null) => r1(median(notNull(inRange.map(f))));
  return {
    from: iso(opts.from),
    to: iso(opts.to),
    minIncluded,
    site: {
      visits: inRange.length,
      medianOccupancyMin: med((v) => span(v.dockedAt, v.departedAt)),
      medianPreOpMin: med((v) => span(v.dockedAt, v.startedAt)),
      medianPostOpMin: med((v) => span(v.finishedAt, v.departedAt)),
    },
    cohorts: cohorts.map((k) => ({ ...k, medianMinPer100: round(k.medianMinPer100, 2) })),
    rows,
  };
}
