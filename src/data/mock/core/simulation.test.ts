// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import {
  EVENT_REGISTRY,
  parseWhEventFromSubject,
  safeParseMessage,
  subjectFor,
  type BayState,
  type MessageKind,
  type WhEvent,
} from '@/domain';
import { shiftOf } from '@/lib/time';
import { CAPTAINS, makePlate } from './catalog';
import { DAY, HOUR, hourOfDay, MIN } from './clock';
import { Depot } from './depot';
import { Rng } from './rng';
import { CFG, makeDepot, PEAK, stream } from './testing';
import type { SimMessage } from './types';

const KINDS: MessageKind[] = [
  'siteState',
  'bayState',
  'actors',
  'case',
  'event',
  'lifecycle',
  'health',
];

let history: Depot;
let live: SimMessage[];

beforeAll(() => {
  history = makeDepot(1, PEAK);
  // 40 simulated minutes of the evening peak, plus one manual trigger per category
  const d = makeDepot(7, PEAK);
  live = [...d.snapshot()];
  d.advanceTo(d.now + 20 * MIN);
  for (const c of [
    'truck',
    'belt',
    'hygiene',
    'handling',
    'ppe',
    'compliance',
    'roster',
    'staging',
    'security',
    'system',
  ]) {
    d.trigger(c);
  }
  d.advanceTo(d.now + 20 * MIN);
  live.push(...d.drain());
}, 60_000);

describe('contract validity', { timeout: 60_000 }, () => {
  it('validates at least 10,000 simulated messages across all kinds with 0 failures', () => {
    expect(live.length).toBeGreaterThanOrEqual(10_000);
    const failures: string[] = [];
    const seen = new Set<MessageKind>();
    for (const m of live) {
      seen.add(m.kind);
      const r = safeParseMessage(m.kind, m.value);
      if (!r.ok) failures.push(`${m.kind}: ${r.error.message}`);
    }
    expect(failures).toEqual([]);
    expect([...seen].sort()).toEqual([...KINDS].sort());
  });

  it('every event matches its subject and is in the closed catalogue', () => {
    const known = new Set(EVENT_REGISTRY.map((e) => e.key));
    let n = 0;
    for (const m of live) {
      if (m.kind !== 'event') continue;
      n += 1;
      const e: WhEvent = m.value;
      expect(known.has(`${e.category}.${e.type}` as never)).toBe(true);
      const subject = `wh.${e.site}.evt.${e.category}.${e.type}`;
      expect(subjectFor(e)).toBe(subject);
      expect(parseWhEventFromSubject(subject, e).ok).toBe(true);
      expect(e.media?.clipKey ?? null).toBeNull();
      if (e.media) {
        const [x, y, w, h] = e.media.bbox;
        expect(x + w).toBeLessThanOrEqual(e.media.frameW);
        expect(y + h).toBeLessThanOrEqual(e.media.frameH);
      }
    }
    expect(n).toBeGreaterThan(20);
  });

  it('keeps the contract refinements (eta, captain, alerts)', () => {
    for (const m of live) {
      if (m.kind !== 'bayState') continue;
      const b = m.value;
      if (b.visit?.etaSource === 'NONE') expect(b.visit.etaMin).toBeNull();
      if (b.alerts.open === 0) expect(b.alerts.maxSev).toBeNull();
      if (b.crew.captain && !b.crew.captain.present) expect(b.crew.captain.trackId).toBeNull();
      if (b.crew.captain?.idSource === 'UNCONFIRMED') expect(b.crew.captain.employeeId).toBeNull();
    }
  });
});

describe('determinism', { timeout: 60_000 }, () => {
  it('same seed gives identical first 1,000 messages; a different seed does not', () => {
    const run = (seed: number) => {
      const d = makeDepot(seed, PEAK);
      const out = stream(d, 10 * MIN);
      return out.slice(0, 1000).map((m) => JSON.stringify(m));
    };
    const a = run(11);
    const b = run(11);
    expect(a).toHaveLength(1000);
    expect(b).toEqual(a);
    expect(run(12)).not.toEqual(a);
  });

  it('does not depend on how the live run is chunked', () => {
    const one = makeDepot(5, PEAK);
    one.advanceTo(one.now + 5 * MIN);
    const split = makeDepot(5, PEAK);
    for (let i = 0; i < 10; i++) split.advanceTo(split.now + 30_000);
    expect(split.drain().map((m) => JSON.stringify(m))).toEqual(
      one.drain().map((m) => JSON.stringify(m)),
    );
  });

  it('manual triggers never change the scripted day', () => {
    const plain = makeDepot(9, PEAK);
    plain.advanceTo(plain.now + 10 * MIN);
    const poked = makeDepot(9, PEAK);
    poked.trigger('hygiene');
    poked.trigger('ppe');
    poked.advanceTo(poked.now + 10 * MIN);
    const visits = (d: Depot) =>
      d.store.visits.map((v) => `${v.visitId}|${v.arrivedAt}|${v.total}`);
    expect(visits(poked)).toEqual(visits(plain));
  });
});

describe('invariants across shifts', { timeout: 60_000 }, () => {
  // 20:30 -> 22:30 crosses the B -> C shift boundary at 22:00
  let msgs: SimMessage[];
  beforeAll(() => {
    msgs = stream(makeDepot(3, Date.parse('2026-10-24T20:30:00+06:00')), 2 * HOUR);
  }, 60_000);

  it('belt.shiftSec has 5 keys summing to the seconds elapsed since shift start (also after the boundary)', () => {
    let checked = 0;
    let afterBoundary = 0;
    let n = 0;
    const problems: string[] = [];
    for (const m of msgs) {
      if (m.kind !== 'bayState') continue;
      const b = m.value;
      const keys = Object.keys(b.belt.shiftSec).sort().join();
      if (keys !== 'noTruck,offline,runningEmpty,runningLoaded,stopped')
        problems.push(`keys ${keys}`);
      const ts = Date.parse(b.ts);
      n += 1;
      // the reference lookup (date-fns-tz) is slow: every 7th message plus every one near the boundary
      const boundary = Math.abs(ts - Date.parse('2026-10-24T22:00:00+06:00')) < 5000;
      if (n % 7 !== 0 && !boundary) continue;
      const start = shiftOf(ts, CFG.shiftsPlaceholder, CFG.businessDayStart)?.start.getTime() ?? 0;
      const sum = Object.values(b.belt.shiftSec).reduce((s, v) => s + v, 0);
      if (Math.abs(sum - (ts - start) / 1000) >= 0.01)
        problems.push(`${b.bay} ${b.ts}: ${sum} vs ${(ts - start) / 1000}`);
      checked += 1;
      if (ts >= Date.parse('2026-10-24T22:00:00+06:00')) afterBoundary += 1;
    }
    expect(problems.slice(0, 5)).toEqual([]);
    expect(checked).toBeGreaterThan(300);
    expect(afterBoundary).toBeGreaterThan(50);
  });

  it('SiteState.shift follows the config shifts', () => {
    const ids = new Set<string>();
    for (const m of msgs) {
      if (m.kind !== 'siteState') continue;
      ids.add(m.value.shift.id);
      const t = Date.parse(m.value.ts);
      expect(Date.parse(m.value.shift.start)).toBeLessThanOrEqual(t);
      expect(t).toBeLessThan(Date.parse(m.value.shift.end));
    }
    expect([...ids].sort()).toEqual(['B', 'C']);
  });

  it('BayState.visit counters equal the CaseTicks emitted for the visit, per SKU too', () => {
    type Track = {
      visitId: string | null;
      baseN: number;
      n: number;
      baseSku: Map<string, number>;
      sku: Map<string, number>;
    };
    const tracks = new Map<string, Track>();
    let compared = 0;
    for (const m of msgs) {
      if (m.kind === 'case') {
        const t = tracks.get(m.value.bay);
        if (!t) continue;
        t.n += 1;
        t.sku.set(m.value.sku, (t.sku.get(m.value.sku) ?? 0) + 1);
      } else if (m.kind === 'bayState') {
        const b = m.value;
        const v = b.visit;
        let t = tracks.get(b.bay);
        if (!v) {
          tracks.delete(b.bay);
          continue;
        }
        if (!t || t.visitId !== v.visitId) {
          t = {
            visitId: v.visitId,
            baseN: v.casesOut + v.casesIn,
            n: 0,
            baseSku: new Map(v.skuTop.map((s) => [s.sku, s.count])),
            sku: new Map(),
          };
          tracks.set(b.bay, t);
          continue;
        }
        expect(v.casesOut + v.casesIn - t.baseN).toBe(t.n);
        for (const s of v.skuTop) {
          const expectedDelta = t.sku.get(s.sku) ?? 0;
          // a SKU that entered the top 5 after the baseline has no baseline; only compare known ones
          if (t.baseSku.has(s.sku))
            expect(s.count - (t.baseSku.get(s.sku) ?? 0)).toBe(expectedDelta);
        }
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(500);
  });

  it('SiteState aggregates equal the bay states published with them', () => {
    const latest = new Map<string, BayState>();
    let compared = 0;
    for (const m of msgs) {
      if (m.kind === 'bayState') latest.set(m.value.bay, m.value);
      if (m.kind !== 'siteState' || latest.size < 7) continue;
      const bays = [...latest.values()];
      const k = m.value.kpi;
      expect(k.casesOut).toBe(bays.reduce((s, b) => s + b.today.casesOut, 0));
      expect(k.casesIn).toBe(bays.reduce((s, b) => s + b.today.casesIn, 0));
      expect(k.baysRunning).toBe(bays.filter((b) => b.belt.status === 'RUNNING_LOADED').length);
      expect(k.trucksDocked).toBe(
        bays.filter(
          (b) => b.visit && ['DOCKED', 'LOADING', 'UNLOADING', 'FINISHED'].includes(b.visit.phase),
        ).length,
      );
      expect(k.trucksOnSite).toBe(k.trucksDocked + k.trucksWaiting);
      expect(k.openAlerts.info + k.openAlerts.warn + k.openAlerts.critical).toBeGreaterThanOrEqual(
        bays.reduce((s, b) => s + b.alerts.open, 0),
      );
      compared += 1;
    }
    expect(compared).toBeGreaterThan(300);
  });

  it('never carries phone or idle behaviour, and no actor activity is PHONE or IDLE', () => {
    const acts = new Set<string>();
    for (const m of msgs) if (m.kind === 'actors') for (const a of m.value.actors) acts.add(a.act);
    expect(acts.has('PHONE')).toBe(false);
    expect(acts.has('IDLE')).toBe(false);
    expect(acts.size).toBeGreaterThan(2);
    const text = msgs.map((m) => JSON.stringify(m.value)).join('\n');
    expect(text).not.toMatch(/phone|PHONE|"IDLE"|idleMin|phoneMin/);
  });

  it('actors stay inside the config zones and carry no names', () => {
    const wz = CFG.bayInterior.workZone;
    const st = CFG.bayInterior.staging;
    const aisle = CFG.bayInterior.forkliftAisle.y;
    const problems: string[] = [];
    let persons = 0;
    let forklifts = 0;
    for (const m of msgs) {
      if (m.kind !== 'actors') continue;
      for (const a of m.value.actors) {
        if (!(a.h > -Math.PI && a.h <= Math.PI)) problems.push(`heading ${a.h}`);
        if (a.kind === 'PERSON') {
          persons += 1;
          const inWork = a.x >= wz.x[0] && a.x <= wz.x[1] && a.y >= wz.y[0] && a.y <= wz.y[1];
          const inStaging = a.x >= st.x[0] && a.x <= st.x[1] && a.y >= st.y[0] && a.y <= st.y[1];
          if (!(inWork || inStaging)) problems.push(`person at ${a.x},${a.y}`);
          if (a.role !== 'CAPTAIN' && a.role !== 'WORKER') problems.push(`person role ${a.role}`);
          if (!a.id.startsWith('t-')) problems.push(`person id ${a.id}`);
        } else {
          forklifts += 1;
          if (a.x < st.x[0] || a.x > st.x[1] || a.y < st.y[0] || a.y > aisle[1])
            problems.push(`forklift at ${a.x},${a.y}`);
          if (a.role !== 'FORKLIFT_OP' || a.ppeOk !== null || !a.id.startsWith('f-'))
            problems.push(`forklift ${a.id}`);
        }
      }
      if (/name|employee/i.test(JSON.stringify(m.value)))
        problems.push('name or employee field in ActorsFrame');
    }
    expect(problems.slice(0, 5)).toEqual([]);
    expect(persons).toBeGreaterThan(500);
    expect(forklifts).toBeGreaterThan(50);
  });

  it('captain names are never published (privacy.showCaptainNames = false)', () => {
    expect(CFG.privacy.showCaptainNames).toBe(false);
    let seen = 0;
    for (const m of msgs) {
      if (m.kind !== 'bayState' || !m.value.crew.captain) continue;
      expect(m.value.crew.captain.name).toBeNull();
      seen += 1;
    }
    expect(seen).toBeGreaterThan(100);
  });

  it('crew per active bay: 1 captain, 3-6 workers, 1 forklift operator', () => {
    let crews = 0;
    for (const m of msgs) {
      if (m.kind !== 'bayState' || m.value.crew.total === 0) continue;
      const c = m.value.crew;
      expect(c.captains).toBe(1);
      expect(c.workers).toBeGreaterThanOrEqual(3);
      expect(c.workers).toBeLessThanOrEqual(6);
      expect(c.forkliftOps).toBe(1);
      expect(c.total).toBe(c.captains + c.workers + c.forkliftOps);
      crews += 1;
    }
    expect(crews).toBeGreaterThan(100);
  });
});

describe('a believable depot week (7 simulated days of history)', { timeout: 60_000 }, () => {
  const visits = () => history.store.visits.filter((v) => v.departedAt !== null);
  const events = () => history.store.events;

  it('runs each visit through arrive, dock, start, finish, depart in order', () => {
    expect(visits().length).toBeGreaterThan(200);
    for (const v of visits()) {
      expect(v.dockedAt).not.toBeNull();
      expect(v.startedAt).not.toBeNull();
      expect(v.finishedAt).not.toBeNull();
      const t = [
        v.arrivedAt,
        v.dockedAt ?? 0,
        v.startedAt ?? 0,
        v.finishedAt ?? 0,
        v.departedAt ?? 0,
      ];
      for (let i = 1; i < t.length; i++) expect(t[i] ?? 0).toBeGreaterThan(t[i - 1] ?? 0);
      // dock -> start is 5-25 minutes after the crew-prep, reverse-in takes 1.5-4
      const startDelay = ((v.startedAt ?? 0) - (v.dockedAt ?? 0)) / MIN;
      expect(startDelay).toBeGreaterThanOrEqual(5);
      expect(startDelay).toBeLessThanOrEqual(25.01);
      // finished = last case + finishedGapMin of no flow
      expect(((v.finishedAt ?? 0) - (v.startedAt ?? 0)) / MIN).toBeGreaterThan(5);
      expect(v.loaded).toBeGreaterThanOrEqual(250);
      expect(v.loaded).toBeLessThanOrEqual(900);
      expect(v.casesOut + v.casesIn).toBeLessThanOrEqual(v.loaded);
      expect(v.dir === 'OUT' ? v.casesIn : v.casesOut).toBe(0);
    }
  });

  it('about 80% of visits are OUT', () => {
    const share = visits().filter((v) => v.dir === 'OUT').length / visits().length;
    expect(share).toBeGreaterThan(0.7);
    expect(share).toBeLessThan(0.9);
  });

  it('trucks arrive every 6-15 minutes in the evening peak and sparsely otherwise', () => {
    const arrivals = events()
      .filter((e) => e.category === 'truck' && e.type === 'arrived')
      .map((e) => Date.parse(e.ts))
      .sort((a, b) => a - b);
    let peakGaps = 0;
    let offGaps = 0;
    for (let i = 1; i < arrivals.length; i++) {
      const prev = arrivals[i - 1] ?? 0;
      const gap = ((arrivals[i] ?? 0) - prev) / MIN;
      const h = hourOfDay(prev);
      if (h >= 17 && h < 23) {
        expect(gap).toBeGreaterThanOrEqual(6 - 1e-6);
        expect(gap).toBeLessThanOrEqual(15 + 1e-6);
        peakGaps += 1;
      } else {
        expect(gap).toBeGreaterThanOrEqual(25 - 1e-6);
        offGaps += 1;
      }
    }
    expect(peakGaps).toBeGreaterThan(100);
    expect(offGaps).toBeGreaterThan(50);
  });

  it('queues trucks when bays are busy (holding lane) and flags detention only past the threshold', () => {
    const waits = visits().map((v) => ((v.dockedAt ?? 0) - v.arrivedAt) / MIN);
    expect(waits.filter((w) => w > 10).length).toBeGreaterThan(5);
    const detentionEvents = events().filter(
      (e) => e.category === 'truck' && e.type === 'detention',
    );
    expect(detentionEvents.length).toBe(history.store.visits.filter((v) => v.detention).length);
    for (const v of history.store.visits) {
      if (v.detention) {
        const end = v.departedAt ?? history.now;
        expect((end - v.arrivedAt) / MIN).toBeGreaterThanOrEqual(CFG.thresholds.detentionMin);
      } else if (v.departedAt !== null) {
        expect((v.departedAt - v.arrivedAt) / MIN).toBeLessThan(CFG.thresholds.detentionMin);
      }
    }
    for (const e of detentionEvents) {
      if (e.type === 'detention')
        expect(e.data.minutes).toBeGreaterThanOrEqual(e.data.thresholdMin);
    }
  });

  it('prints Bangla plates with the DA/TA/NA/SHA transliteration', () => {
    const pairs: Record<string, string> = { ট: 'TA', ড: 'DA', ন: 'NA', শ: 'SHA' };
    const rng = new Rng(3);
    const sample = [
      ...history.store.visits.map((v) => v.plate),
      ...Array.from({ length: 200 }, () => makePlate(rng)),
    ];
    const seen = new Set<string>();
    for (const p of sample) {
      const bn = /^ঢাকা মেট্রো-(ট|ড|ন|শ) ([১-৪][০-৯])-([০-৯]{4})$/.exec(p.bn);
      expect(bn, p.bn).not.toBeNull();
      const en = /^DHAKA METRO-(TA|DA|NA|SHA) (\d{2})-(\d{4})$/.exec(p.en);
      expect(en, p.en).not.toBeNull();
      expect(pairs[bn?.[1] ?? '']).toBe(en?.[1]);
      const cls = Number(en?.[2]);
      expect(cls).toBeGreaterThanOrEqual(11);
      expect(cls).toBeLessThanOrEqual(40);
      seen.add(en?.[1] ?? '');
    }
    expect([...seen].sort()).toEqual(['DA', 'NA', 'SHA', 'TA']);
  });

  it('mixes SKUs including Rin and Wheel SACK, with 3-5% UNKNOWN', () => {
    let unknown = 0;
    let total = 0;
    const packs = new Map<string, string>();
    for (const v of history.store.visits) {
      for (const [sku, t] of v.sku) {
        total += t.count;
        if (sku === 'UNKNOWN') unknown += t.count;
        packs.set(sku, t.pack);
      }
    }
    expect(packs.get('RIN-PB-1KG')).toBe('SACK');
    expect(packs.get('WHL-1KG')).toBe('SACK');
    expect(packs.size).toBeGreaterThanOrEqual(12);
    expect(unknown / total).toBeGreaterThan(0.03);
    expect(unknown / total).toBeLessThan(0.05);
  });

  it('raises hygiene, fall-off, PPE, pallet and empty-run events at roughly the specified rates', () => {
    const count = (key: string) => events().filter((e) => `${e.category}.${e.type}` === key).length;
    const items = history.store.visits.reduce((s, v) => s + v.casesOut + v.casesIn, 0);
    const sacks = history.store.visits.reduce(
      (s, v) =>
        s + [...v.sku.values()].filter((t) => t.pack === 'SACK').reduce((a, t) => a + t.count, 0),
      0,
    );
    expect(count('hygiene.damaged') / items).toBeGreaterThan(0.0035);
    expect(count('hygiene.damaged') / items).toBeLessThan(0.0065);
    expect(count('hygiene.open_tape') / items).toBeGreaterThan(0.002);
    expect(count('hygiene.open_tape') / items).toBeLessThan(0.0045);
    expect(count('hygiene.torn_sack') / sacks).toBeGreaterThan(0.0025);
    expect(count('hygiene.torn_sack') / sacks).toBeLessThan(0.0055);
    const days = (history.now - history.historyStartMs) / DAY;
    expect(count('belt.fall_off') / days / 7).toBeGreaterThan(0.4);
    expect(count('belt.fall_off') / days / 7).toBeLessThan(2.5);
    const shifts = days * 3;
    expect(count('ppe.violation') / shifts).toBeGreaterThan(1.2);
    expect(count('ppe.violation') / shifts).toBeLessThan(5);
    expect(count('staging.pallet_wait')).toBeGreaterThan(5);
    expect(count('belt.empty_run')).toBeGreaterThan(5);
    expect(count('compliance.on_belt')).toBeLessThan(8);
    for (const e of events()) {
      if (e.type === 'empty_run')
        expect(e.data.minutes).toBeGreaterThanOrEqual(CFG.thresholds.emptyRunMin);
      if (e.type === 'pallet_wait')
        expect(e.data.oldestWaitSec).toBeGreaterThanOrEqual(CFG.thresholds.palletWaitSec);
    }
  });

  it('raises exactly one camera_offline and one camera_ok per simulated day, and the alert is closed on recovery', () => {
    const byDay = new Map<string, { off: number; ok: number }>();
    for (const e of events()) {
      if (e.category !== 'system') continue;
      const day = e.ts.slice(0, 10);
      const d = byDay.get(day) ?? { off: 0, ok: 0 };
      if (e.type === 'camera_offline') d.off += 1;
      if (e.type === 'camera_ok') d.ok += 1;
      byDay.set(day, d);
    }
    expect(byDay.size).toBeGreaterThanOrEqual(7);
    for (const [, d] of byDay) expect(d).toEqual({ off: 1, ok: 1 });
    for (const e of events()) if (e.type === 'camera_offline') expect(e.status).toBe('CLOSED');
  });

  it('assigns each captain from the roster', () => {
    const ids = new Set(CAPTAINS.map((c) => c.employeeId));
    const docked = history.store.visits.filter((v) => v.dockedAt !== null);
    expect(docked.length).toBeGreaterThan(200);
    expect(docked.filter((v) => !ids.has(v.captain ?? '')).length).toBe(0);
  });
});

describe('24 simulated hours', () => {
  it('complete in under 20 s of test time, with valid messages and ordered timestamps', () => {
    const t0 = performance.now();
    const d = makeDepot(21, Date.parse('2026-10-25T06:00:00+06:00'), 0);
    d.advanceTo(d.now + 24 * HOUR);
    const msgs = d.drain();
    const elapsed = performance.now() - t0;
    let bad = 0;
    for (let i = 0; i < msgs.length; i += 40) {
      const m = msgs[i];
      if (m && !safeParseMessage(m.kind, m.value).ok) bad += 1;
    }
    for (const m of msgs)
      if (m.kind === 'event' && !safeParseMessage('event', m.value).ok) bad += 1;
    console.log(`24 h simulated: ${msgs.length} messages in ${Math.round(elapsed)} ms`);
    expect(bad).toBe(0);
    expect(msgs.length).toBeGreaterThan(100_000);
    expect(elapsed).toBeLessThan(20_000);
    expect(d.now - Date.parse('2026-10-25T06:00:00+06:00')).toBe(24 * HOUR);
    let last = 0;
    for (const m of msgs) {
      if (m.kind !== 'bayState') continue;
      const t = Date.parse(m.value.ts);
      expect(t).toBeGreaterThanOrEqual(last - 1000);
      last = Math.max(last, t);
    }
  }, 60_000);
});

describe('privacy and configuration', { timeout: 60_000 }, () => {
  it('the simulator source knows nothing about worker phone use or idle minutes', () => {
    const files = import.meta.glob('./**/*.ts', { query: '?raw', import: 'default', eager: true });
    const sources = Object.entries(files).filter(([name]) => !name.endsWith('.test.ts'));
    expect(sources.length).toBeGreaterThan(10);
    for (const [name, text] of sources) {
      // (doorOpenIdleMin is a site threshold, not a worker metric)
      expect(String(text), name).not.toMatch(/phone|(?<![A-Za-z])idleMin/i);
    }
  });

  it('reads detention, empty-run and pallet thresholds live from the config', () => {
    const d = makeDepot(4, PEAK, 1);
    d.cfg.thresholds.detentionMin = 5;
    d.advanceTo(d.now + 30 * MIN);
    const detentions = d
      .drain()
      .flatMap((m) => (m.kind === 'event' && m.value.type === 'detention' ? [m.value] : []));
    expect(detentions.length).toBeGreaterThan(3);
    for (const e of detentions) if (e.type === 'detention') expect(e.data.thresholdMin).toBe(5);
  });

  it('generates 7 days of history quickly', () => {
    const t0 = performance.now();
    const d = makeDepot(2, PEAK);
    const ms = performance.now() - t0;
    console.log(
      `7-day history: ${Math.round(ms)} ms (${d.store.visits.length} visits, ${d.store.events.length} events)`,
    );
    // the brief targets < 3 s on a normal desktop; the hard limit here leaves room for a loaded CI box
    expect(ms).toBeLessThan(10_000);
  });
});
