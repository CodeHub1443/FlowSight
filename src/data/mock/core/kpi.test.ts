// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { safeParseMessage, type SiteState } from '@/domain';
import { MIN } from './clock';
import { aggregateTurnaround, complianceScoreOf, type VisitTimes } from './kpi';
import { makeDepot, PEAK } from './testing';

// kpi.turnaround from hand-built visits (contract rev 1.1, docs/03 section 3.1).

const T0 = Date.parse('2026-10-24T08:00:00+06:00');
const at = (min: number) => T0 + min * MIN;

/** A completed visit: arrive, then wait, pre-op, work and post-op spans in minutes. */
function visit(wait: number, pre: number, work: number, post: number, startMin = 0): VisitTimes {
  const arrivedAt = at(startMin);
  const dockedAt = arrivedAt + wait * MIN;
  const startedAt = dockedAt + pre * MIN;
  const finishedAt = startedAt + work * MIN;
  return { arrivedAt, dockedAt, startedAt, finishedAt, departedAt: finishedAt + post * MIN };
}

describe('aggregateTurnaround', () => {
  it('an empty day has n = 0 and every mean null', () => {
    expect(aggregateTurnaround([])).toEqual({
      n: 0,
      depotTatMin: null,
      waitForDockMin: null,
      occupancyMin: null,
      preOpDelayMin: null,
      activeMin: null,
      postOpDelayMin: null,
    });
  });

  it('visits still at the depot are not in the sample', () => {
    const here: VisitTimes = { ...visit(5, 5, 30, 5), finishedAt: null, departedAt: null };
    expect(aggregateTurnaround([here]).n).toBe(0);
    expect(aggregateTurnaround([here]).occupancyMin).toBeNull();
  });

  it('averages each span and keeps both identities', () => {
    const r = aggregateTurnaround([visit(10, 6, 40, 4), visit(20, 14, 50, 6, 30)]);
    expect(r).toEqual({
      n: 2,
      depotTatMin: 75,
      waitForDockMin: 15,
      occupancyMin: 60,
      preOpDelayMin: 10,
      activeMin: 45,
      postOpDelayMin: 5,
    });
    const n = (x: number | null) => x ?? Number.NaN;
    expect(n(r.preOpDelayMin) + n(r.activeMin) + n(r.postOpDelayMin)).toBe(r.occupancyMin);
    expect(n(r.waitForDockMin) + n(r.occupancyMin)).toBe(r.depotTatMin);
  });

  it('a null timestamp drops that visit from the spans that need it, not from n or the turnaround', () => {
    // The second truck left without ever starting (no carton moved): no pre-op end, no work span.
    const noStart: VisitTimes = { ...visit(10, 0, 0, 0, 30), startedAt: null, finishedAt: null };
    noStart.departedAt = (noStart.dockedAt ?? 0) + 20 * MIN;
    const r = aggregateTurnaround([visit(10, 6, 40, 4), noStart]);
    expect(r.n).toBe(2);
    expect(r.depotTatMin).toBe(45); // (60 + 30) / 2
    expect(r.waitForDockMin).toBe(10);
    expect(r.occupancyMin).toBe(35); // (50 + 20) / 2
    expect(r.preOpDelayMin).toBe(6);
    expect(r.activeMin).toBe(40);
    expect(r.postOpDelayMin).toBe(4);
  });

  it('a visit with no dockedAt still counts in the depot turnaround', () => {
    const undocked: VisitTimes = { ...visit(0, 0, 0, 0), dockedAt: null, startedAt: null };
    undocked.finishedAt = null;
    undocked.departedAt = undocked.arrivedAt + 12 * MIN;
    const r = aggregateTurnaround([undocked]);
    expect(r).toMatchObject({ n: 1, depotTatMin: 12, waitForDockMin: null, occupancyMin: null });
  });

  it('rounds to whole minutes like avgTatMin and never goes negative', () => {
    const r = aggregateTurnaround([visit(1, 1, 1, 1), visit(2, 2, 2, 2)]);
    expect(r.activeMin).toBe(2); // 1.5 rounds half up
    const skew: VisitTimes = { ...visit(5, 5, 5, 5), startedAt: at(4) }; // started "before" docking
    expect(aggregateTurnaround([skew]).preOpDelayMin).toBe(0);
  });
});

describe('complianceScoreOf (PPE only)', () => {
  it('starts at 100, falls with PPE violations and is clamped', () => {
    expect(complianceScoreOf(0)).toBe(100);
    expect(complianceScoreOf(6)).toBe(91);
    expect(complianceScoreOf(1000)).toBe(0);
  });
});

describe('simulator SiteState carries rev 1.1 fields', { timeout: 60_000 }, () => {
  it('kpi.turnaround is valid, depotTatMin = avgTatMin, identities hold within rounding', () => {
    const d = makeDepot(4, PEAK, 1);
    const site: SiteState = d.siteState();
    expect(safeParseMessage('siteState', site).ok).toBe(true);
    const t = site.kpi.turnaround;
    expect(t).toBeDefined();
    if (!t) return;
    // By 19:20 the day has completed visits.
    expect(t.n).toBeGreaterThan(0);
    expect(t.depotTatMin).toBe(site.kpi.avgTatMin);
    const parts = [
      t.preOpDelayMin,
      t.activeMin,
      t.postOpDelayMin,
      t.occupancyMin,
      t.waitForDockMin,
    ];
    expect(parts.every((v) => v !== null)).toBe(true);
    const [pre = 0, work = 0, post = 0, occ = 0, wait = 0] = parts.map((v) => v ?? Number.NaN);
    expect(Math.abs(pre + work + post - occ)).toBeLessThanOrEqual(2);
    expect(Math.abs(wait + occ - (t.depotTatMin ?? Number.NaN))).toBeLessThanOrEqual(1);
    // n matches the per-bay truck turnarounds counted today
    expect(t.n).toBe(d.bays.reduce((s, b) => s + b.today.tatN, 0));
  });

  it('every visit in BayState carries skuCount >= the recognised SKUs in skuTop', () => {
    const d = makeDepot(4, PEAK, 1);
    let seen = 0;
    for (const b of d.bays) {
      const v = b.state(d.now).visit;
      if (!v) continue;
      seen += 1;
      expect(typeof v.skuCount).toBe('number');
      expect(v.skuCount).toBeGreaterThanOrEqual(v.skuTop.filter((s) => s.sku !== 'UNKNOWN').length);
    }
    expect(seen).toBeGreaterThan(0);
  });
});
