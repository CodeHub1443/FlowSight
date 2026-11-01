import bayJson from '@/domain/fixtures/bay-state.json';
import type { Actor, ActorsFrame, BayState, CaseTick } from '@/domain';
import type { ActorFeed } from '../actors/feed';

// `?actors=demo` in the dev preview (docs/05 step 7: "static demo arrangement"): every truck state, every animation, a
// PPE ring, a loaded forklift and a flagged item at once, in contract shapes, on a fixed schedule. Dev only; the app reads
// live data. The mock simulator shows each of these too, but a queue or a carrying forklift only now and then.

const base = bayJson as unknown as BayState;

const plate = (bn: string, en: string) => ({ bn, en, conf: 0.93 });
const PLATES = [
  plate('ঢাকা মেট্রো-ড ১১-২১৭১', 'DHAKA METRO-DA 11-2171'),
  plate('ঢাকা মেট্রো-ট ২২-৪৮১৫', 'DHAKA METRO-TA 22-4815'),
  plate('ঢাকা মেট্রো-ন ৩৪-৪৮২১', 'DHAKA METRO-NA 34-4821'),
  plate('ঢাকা মেট্রো-শ ৩৩-৬০১৯', 'DHAKA METRO-SHA 33-6019'),
  plate('ঢাকা মেট্রো-ড ২৩-৩৪২১', 'DHAKA METRO-DA 23-3421'),
  plate('ঢাকা মেট্রো-ন ১৮-১৮৯৮', 'DHAKA METRO-NA 18-1898'),
  plate('ঢাকা মেট্রো-শ ৩৫-২৪১৬', 'DHAKA METRO-SHA 35-2416'),
];

function bay(id: string, over: Partial<BayState>): BayState {
  const running = over.visit !== null;
  return {
    ...base,
    bay: id,
    visit: null,
    queue: [],
    belt: { ...base.belt, status: running ? 'RUNNING_LOADED' : 'NO_TRUCK' },
    ...over,
  };
}

function visit(n: number, phase: NonNullable<BayState['visit']>['phase']): BayState['visit'] {
  const v = base.visit;
  if (!v) throw new Error('fixture has a visit');
  const p = PLATES[n] ?? v.plate;
  return { ...v, visitId: `V-DEMO-${n}`, plate: p, phase };
}

const queued = (n: number, slot: number): BayState['queue'][number] => ({
  visitId: `V-DEMO-${n}`,
  plate: PLATES[n] ?? (PLATES[0] as (typeof PLATES)[number]),
  arrivedAt: '2026-10-24T19:41:12+06:00',
  slot,
});

const BAYS: Record<string, BayState> = {
  B01: bay('B01', { visit: visit(0, 'LOADING') }),
  B02: bay('B02', { visit: visit(1, 'FINISHED') }),
  B03: bay('B03', { visit: visit(2, 'ARRIVED'), queue: [queued(2, 1)] }),
  B04: bay('B04', { visit: visit(3, 'LOADING') }),
  B05: bay('B05', { queue: [queued(4, 2), queued(5, 3)] }),
  B06: bay('B06', { queue: [queued(6, 4)] }),
};

const actor = (over: Partial<Actor> & Pick<Actor, 'id' | 'x' | 'y'>): Actor => ({
  kind: 'PERSON',
  role: 'WORKER',
  h: Math.PI,
  act: 'STATIONARY',
  ppeOk: true,
  ...over,
});

/** A crew in bay B04 and a forklift carrying a pallet along the aisle; `t` in seconds. */
function b04(t: number): Actor[] {
  const pace = Math.sin(t / 4);
  return [
    actor({ id: 't-1', role: 'CAPTAIN', x: -1.5, y: 8.2, act: 'SCANNING' }),
    actor({ id: 't-2', x: 1.5, y: 7.2, act: 'HANDLING' }),
    actor({ id: 't-3', x: 1.6, y: 8.6, act: 'HANDLING', ppeOk: false }),
    actor({
      id: 't-4',
      x: 2.1,
      y: 10 + pace * 1.6,
      h: Math.cos(t / 4) >= 0 ? 0 : Math.PI,
      act: 'WALKING',
    }),
    actor({ id: 't-5', x: 1.2, y: 10.5, h: 0.6, act: 'STATIONARY' }),
    actor({
      id: 't-6',
      x: -2.2,
      y: 11 - pace,
      h: Math.cos(t / 4) >= 0 ? Math.PI : 0,
      act: 'CARRYING',
    }),
    {
      id: 'f-1',
      kind: 'FORKLIFT',
      role: 'FORKLIFT_OP',
      x: Math.sin(t / 7) * 2.5,
      y: 18,
      h: -Math.PI / 2,
      act: 'CARRYING',
      ppeOk: null,
    },
  ];
}

function frame(t: number): ActorsFrame {
  return {
    v: 1,
    ts: new Date().toISOString(),
    site: base.site,
    bay: 'B04',
    actors: b04(t),
  };
}

const SKUS = ['RIN-PB-1KG', 'SURF-EXCEL-500', 'LUX-SOAP-100', 'VIM-BAR-300', 'UNKNOWN'] as const;
const PACKS = ['CASE', 'SACK', 'SHRINK', 'CASE', 'CASE'] as const;

export function createDemoFeed(): ActorFeed {
  const frames = new Set<(f: ActorsFrame | undefined) => void>();
  const cases = new Set<(c: CaseTick) => void>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let n = 0;
  const ensure = () => {
    timer ??= setInterval(() => {
      n += 1;
      const f = frame(n / 2);
      for (const cb of frames) cb(f);
      // about 40 cases a minute on the two belts with a crew
      if (n % 2 === 0) {
        const i = (n / 2) % SKUS.length;
        const tick: CaseTick = {
          v: 1,
          ts: f.ts,
          site: base.site,
          bay: i % 2 === 0 ? 'B04' : 'B01',
          dir: i === 3 ? 'IN' : 'OUT',
          sku: SKUS[i] ?? 'UNKNOWN',
          pack: PACKS[i] ?? 'CASE',
          conf: 0.91,
          flag: n % 18 === 0 ? 'DAMAGED' : null,
        };
        for (const cb of cases) cb(tick);
      }
    }, 500);
  };
  return {
    getBay: (id) => BAYS[id],
    subscribeBay: () => () => undefined,
    getActors: (id) => (id === 'B04' ? frame(0) : undefined),
    subscribeActors: (id, cb) => {
      if (id !== 'B04') return () => undefined;
      frames.add(cb);
      ensure();
      return () => frames.delete(cb);
    },
    subscribeCases: (cb) => {
      cases.add(cb);
      ensure();
      return () => cases.delete(cb);
    },
  };
}
