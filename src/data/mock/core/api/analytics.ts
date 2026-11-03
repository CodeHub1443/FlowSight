import type {
  BeltUtilisationResponse,
  CameraUptimeResponse,
  ComplianceResponse,
  DwellResponse,
  HygieneResponse,
  ProductivityResponse,
  Series,
  SkuAnalyticsResponse,
  SkuRow,
  ThroughputResponse,
} from '@/domain';
import { AGENCIES, skuInfo, skuName, UNKNOWN_SKU } from '../catalog';
import { DAY, HOUR, hourOfDay, iso, MIN } from '../clock';
import type { Depot } from '../depot';
import { complianceScoreOf } from '../kpi';
import { round } from '../rng';
import { BELT_KEYS, type BeltAcc } from '../types';
import { BELT_KEY_OF } from '../ctx';
import { bayLabel, csv, floorTo, stepOf } from './util';

const OUT_IN_LABEL = {
  OUT: { en: 'Out', bn: 'আউট' },
  IN: { en: 'In', bn: 'ইন' },
} as const;

const emptyAcc = (): BeltAcc => ({
  runningLoaded: 0,
  runningEmpty: 0,
  stopped: 0,
  noTruck: 0,
  offline: 0,
});

export function throughput(
  depot: Depot,
  q: Record<string, string>,
  from: number,
  to: number,
): ThroughputResponse {
  const unit = q.bucket === 'day' ? 'day' : 'hour';
  const bays = csv(q.bay) ?? depot.bays.map((b) => b.id);
  const dirs: ('OUT' | 'IN')[] =
    q.dir === 'OUT' ? ['OUT'] : q.dir === 'IN' ? ['IN'] : ['OUT', 'IN'];
  const series: Series[] = [];
  const start = floorTo(from, unit, depot);
  for (const bay of bays) {
    for (const dir of dirs) {
      const points: Series['points'] = [];
      const step = stepOf(unit);
      for (let t = start; t < to; t += step) {
        let sum = 0;
        for (let h = Math.floor(t / HOUR); h < Math.ceil((t + step) / HOUR); h++) {
          sum += depot.store.hourCounts.get(`${bay}|${dir}|${h}`) ?? 0;
        }
        points.push({ t: iso(t), v: sum });
      }
      const bl = bayLabel(depot, bay);
      series.push({
        key: `${bay}.${dir}`,
        label: {
          en: `${bl.en} · ${OUT_IN_LABEL[dir].en}`,
          bn: `${bl.bn} · ${OUT_IN_LABEL[dir].bn}`,
        },
        points,
      });
    }
  }
  return { series };
}

function p90(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))] ?? 0;
}

export function dwell(
  depot: Depot,
  q: Record<string, string>,
  from: number,
  to: number,
): DwellResponse {
  const groupBy = q.groupBy === 'agency' ? 'agency' : 'bay';
  const groups = new Map<
    string,
    {
      label: { en: string; bn: string };
      totals: number[];
      wait: number[];
      active: number[];
      post: number[];
      det: number;
    }
  >();
  const hist = new Map<number, number>();
  for (const v of depot.store.visits) {
    if (v.departedAt === null || v.departedAt < from || v.departedAt >= to) continue;
    const key = groupBy === 'bay' ? v.bay : (v.agency?.en ?? 'UNKNOWN');
    const label =
      groupBy === 'bay'
        ? bayLabel(depot, v.bay)
        : (v.agency ?? { en: 'Unknown agency', bn: 'অজানা এজেন্সি' });
    let g = groups.get(key);
    if (!g) {
      g = { label, totals: [], wait: [], active: [], post: [], det: 0 };
      groups.set(key, g);
    }
    const total = (v.departedAt - v.arrivedAt) / MIN;
    g.totals.push(total);
    g.wait.push(((v.startedAt ?? v.arrivedAt) - v.arrivedAt) / MIN);
    g.active.push(
      ((v.finishedAt ?? v.startedAt ?? v.arrivedAt) - (v.startedAt ?? v.arrivedAt)) / MIN,
    );
    g.post.push((v.departedAt - (v.finishedAt ?? v.departedAt)) / MIN);
    if (v.detention) g.det += 1;
    const bin = Math.floor(total / 15) * 15;
    hist.set(bin, (hist.get(bin) ?? 0) + 1);
  }
  const avg = (a: number[]): number =>
    a.length === 0 ? 0 : round(a.reduce((x, y) => x + y, 0) / a.length, 1);
  return {
    groups: [...groups.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, g]) => ({
        key,
        label: g.label,
        n: g.totals.length,
        waitToStartMin: avg(g.wait),
        activeMin: avg(g.active),
        postLoadMin: avg(g.post),
        p90TotalMin: round(p90([...g.totals].sort((a, b) => a - b)), 1),
        detentions: g.det,
      })),
    histogram: [...hist.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([binMin, count]) => ({ binMin, count })),
  };
}

export function beltUtilisation(
  depot: Depot,
  q: Record<string, string>,
  from: number,
  to: number,
): BeltUtilisationResponse {
  const bays = csv(q.bay) ?? depot.bays.map((b) => b.id);
  return {
    bays: bays.map((bay) => {
      const sec = emptyAcc();
      const intervals: BeltUtilisationResponse['bays'][number]['intervals'] = [];
      const list = [...(depot.store.belt.get(bay) ?? [])];
      const sim = depot.bays.find((b) => b.id === bay);
      if (sim) list.push({ status: sim.shown, start: sim.since, end: depot.now });
      for (const i of list) {
        const s = Math.max(i.start, from);
        const e = Math.min(i.end, to);
        if (e <= s) continue;
        const key = BELT_KEY_OF[i.status];
        if (key) sec[key] += (e - s) / 1000;
        intervals.push({
          status:
            i.status as BeltUtilisationResponse['bays'][number]['intervals'][number]['status'],
          start: iso(s),
          end: iso(e),
        });
      }
      for (const k of BELT_KEYS) sec[k] = round(sec[k], 1);
      return { bay, sec, intervals };
    }),
  };
}

export function skuAnalytics(
  depot: Depot,
  q: Record<string, string>,
  from: number,
  to: number,
): SkuAnalyticsResponse {
  const acc = new Map<string, { count: number; confSum: number }>();
  const visitId = q.visitId;
  if (visitId) {
    const v = depot.store.visitById.get(visitId);
    for (const [sku, t] of v?.sku ?? []) acc.set(sku, { count: t.count, confSum: t.confSum });
  } else {
    const bays = csv(q.bay);
    for (const [key, val] of depot.store.skuHour) {
      const [h, bay, sku] = key.split('|');
      const t = Number(h) * HOUR;
      if (t + HOUR <= from || t >= to) continue;
      if (bays && !bays.includes(bay ?? '')) continue;
      const cur = acc.get(sku ?? '') ?? { count: 0, confSum: 0 };
      cur.count += val.count;
      cur.confSum += val.confSum;
      acc.set(sku ?? '', cur);
    }
  }
  const rows: SkuRow[] = [...acc.entries()]
    .map(([sku, t]) => ({
      sku,
      name: skuName(sku),
      pack: skuInfo(sku)?.pack ?? 'CASE',
      count: t.count,
      avgConf: sku === UNKNOWN_SKU ? 0 : round(t.confSum / Math.max(1, t.count), 2),
    }))
    .sort((a, b) => b.count - a.count);
  const total = rows.reduce((s, r) => s + r.count, 0);
  const unknown = acc.get(UNKNOWN_SKU)?.count ?? 0;
  return { rows, unknownSharePct: total > 0 ? round((unknown / total) * 100, 1) : 0 };
}

export function compliance(depot: Depot, from: number, to: number): ComplianceResponse {
  const byType = new Map<string, number>();
  const heat = new Map<string, number>();
  const perDay = new Map<string, number>();
  for (const e of depot.store.eventsBetween(from, to)) {
    if (e.category !== 'ppe' && e.category !== 'compliance') continue;
    const t = Date.parse(e.ts);
    const key = `${e.category}.${e.type}`;
    byType.set(key, (byType.get(key) ?? 0) + 1);
    if (e.bay) {
      const hk = `${e.bay}|${hourOfDay(t)}`;
      heat.set(hk, (heat.get(hk) ?? 0) + 1);
    }
    const day = depot.clock.businessDay(t);
    // The score series is PPE compliance (contract rev 1.1): safety events are counted in byType, not in the score.
    if (e.category === 'ppe') perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  const points: Series['points'] = [];
  for (let t = depot.clock.businessDayStart(from); t < to; t += DAY) {
    points.push({ t: iso(t), v: complianceScoreOf(perDay.get(depot.clock.businessDay(t)) ?? 0) });
  }
  return {
    byType: [...byType.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count })),
    heatmap: [...heat.entries()].map(([k, count]) => {
      const [bay, hour] = k.split('|');
      return { bay: bay ?? '', hour: Number(hour), count };
    }),
    score: {
      key: 'compliance',
      label: { en: 'Compliance score', bn: 'কমপ্লায়েন্স স্কোর' },
      points,
    },
  };
}

type HygRow = {
  damaged: number;
  openTape: number;
  tornSack: number;
  wetStained: number;
  fallOff: number;
};
const zeroHyg = (): HygRow => ({ damaged: 0, openTape: 0, tornSack: 0, wetStained: 0, fallOff: 0 });

export function hygiene(depot: Depot, from: number, to: number): HygieneResponse {
  const bySku = new Map<string, HygRow>();
  const byBay = new Map<string, HygRow>();
  const byAgency = new Map<string, HygRow>();
  const bump = (m: Map<string, HygRow>, key: string, field: keyof HygRow): void => {
    const row = m.get(key) ?? zeroHyg();
    row[field] += 1;
    m.set(key, row);
  };
  for (const e of depot.store.eventsBetween(from, to)) {
    const field: keyof HygRow | null =
      e.category === 'hygiene' && e.type === 'damaged'
        ? 'damaged'
        : e.category === 'hygiene' && e.type === 'open_tape'
          ? 'openTape'
          : e.category === 'hygiene' && e.type === 'torn_sack'
            ? 'tornSack'
            : e.category === 'hygiene' && e.type === 'wet_stained'
              ? 'wetStained'
              : e.category === 'belt' && e.type === 'fall_off'
                ? 'fallOff'
                : null;
    if (!field) continue;
    const sku = e.refs.sku ?? UNKNOWN_SKU;
    bump(bySku, sku, field);
    if (e.bay) bump(byBay, e.bay, field);
    const v = e.refs.visitId ? depot.store.visitById.get(e.refs.visitId) : undefined;
    bump(byAgency, v?.agency?.en ?? 'UNKNOWN', field);
  }
  // denominators
  const skuTotals = new Map<string, number>();
  const bayTotals = new Map<string, number>();
  for (const [key, val] of depot.store.skuHour) {
    const [h, bay, sku] = key.split('|');
    const t = Number(h) * HOUR;
    if (t + HOUR <= from || t >= to) continue;
    skuTotals.set(sku ?? '', (skuTotals.get(sku ?? '') ?? 0) + val.count);
    bayTotals.set(bay ?? '', (bayTotals.get(bay ?? '') ?? 0) + val.count);
  }
  const agencyTotals = new Map<string, number>();
  for (const v of depot.store.visits) {
    if (v.arrivedAt < from || v.arrivedAt >= to) continue;
    const k = v.agency?.en ?? 'UNKNOWN';
    agencyTotals.set(k, (agencyTotals.get(k) ?? 0) + v.casesOut + v.casesIn);
  }
  const rows = (
    m: Map<string, HygRow>,
    totals: Map<string, number>,
    label: (k: string) => { en: string; bn: string },
  ) =>
    [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, r]) => {
        const total = totals.get(key) ?? 0;
        const flagged = r.damaged + r.openTape + r.tornSack + r.wetStained;
        return {
          key,
          label: label(key),
          ...r,
          ratePct: total > 0 ? round((flagged / total) * 100, 2) : 0,
        };
      });
  return {
    bySku: rows(bySku, skuTotals, (k) => skuName(k) ?? { en: 'Unknown SKU', bn: 'অজানা এসকেইউ' }),
    byBay: rows(byBay, bayTotals, (k) => bayLabel(depot, k)),
    byAgency: rows(
      byAgency,
      agencyTotals,
      (k) => AGENCIES.find((a) => a.en === k) ?? { en: 'Unknown agency', bn: 'অজানা এজেন্সি' },
    ),
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

export function productivity(depot: Depot, from: number, to: number): ProductivityResponse {
  const groups = new Map<
    string,
    { bay: string; shift: string; cases: number; manHours: number; crew: number[]; waits: number[] }
  >();
  for (const v of depot.store.visits) {
    if (v.startedAt === null || v.finishedAt === null || v.startedAt < from || v.startedAt >= to)
      continue;
    const key = `${v.bay}|${v.shiftId}`;
    const g = groups.get(key) ?? {
      bay: v.bay,
      shift: v.shiftId,
      cases: 0,
      manHours: 0,
      crew: [],
      waits: [],
    };
    g.cases += v.casesOut + v.casesIn;
    g.manHours += (Math.max(1, v.crewTotal) * (v.finishedAt - v.startedAt)) / HOUR;
    g.crew.push(v.crewTotal);
    g.waits.push(...v.palletWaitsSec);
    groups.set(key, g);
  }
  return {
    rows: [...groups.values()]
      .sort((a, b) => a.bay.localeCompare(b.bay) || a.shift.localeCompare(b.shift))
      .map((g) => {
        const waits = [...g.waits].sort((a, b) => a - b);
        return {
          bay: g.bay,
          shift: g.shift,
          casesPerManHour: g.manHours > 0 ? round(g.cases / g.manHours, 1) : 0,
          avgCrew: round(g.crew.reduce((s, x) => s + x, 0) / Math.max(1, g.crew.length), 1),
          palletWaitP50Sec: percentile(waits, 0.5),
          palletWaitP90Sec: percentile(waits, 0.9),
        };
      }),
  };
}

export function cameraUptime(depot: Depot, from: number, to: number): CameraUptimeResponse {
  const span = Math.max(1, to - from);
  const cams: CameraUptimeResponse['cams'] = [];
  for (const b of depot.bays) {
    for (const role of ['DOCK', 'CREW', 'BELT']) {
      const cam = `${b.id}-${role}`;
      let down = 0;
      let incidents = 0;
      for (const i of depot.store.incidents) {
        if (i.cam !== cam) continue;
        const end = i.to ?? depot.now;
        const s = Math.max(i.from, from);
        const e = Math.min(end, to);
        if (e > s) {
          down += e - s;
          incidents += 1;
        }
      }
      cams.push({ cam, uptimePct: round(100 - (down / span) * 100, 2), incidents });
    }
  }
  return { cams };
}
