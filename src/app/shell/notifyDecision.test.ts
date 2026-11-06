import { describe, expect, it } from 'vitest';
import type { Severity, WhEventWithStatus } from '@/domain';
import { makeEvent, ulid } from '@/stores/testUtils';
import {
  BACKFILL_MS,
  COLLAPSE_MS,
  DEDUPE_MS,
  MAX_TOASTS,
  WARN_DURATION_MS,
  applyDecision,
  decideNotification,
  emptyHistory,
  removeToast,
  toastDuration,
  type NotifyHistory,
  type NotifySession,
} from './notifyDecision';

const T = 1_000_000;
const session = (over: Partial<NotifySession> = {}): NotifySession => ({
  role: 'DC_MANAGER',
  live: true,
  liveSince: T - 60_000,
  now: T,
  ...over,
});

const PPE = { trackId: null, role: 'WORKER' as const, missing: ['helmet' as const] };

let n = 0;
function ev(over: {
  category?: string;
  type?: string;
  data?: unknown;
  bay?: string | null;
  sev?: Severity;
  status?: WhEventWithStatus['status'];
  visitId?: string | null;
}): WhEventWithStatus {
  n += 1;
  const base = makeEvent(ulid(n), {
    category: over.category ?? 'hygiene',
    type: over.type ?? 'damaged',
    data: over.data ?? { sku: 'RIN-PB-1KG', pack: 'SACK' },
    bay: over.bay === undefined ? 'B04' : over.bay,
  });
  return {
    ...base,
    sev: over.sev ?? 'warn',
    refs: { ...base.refs, visitId: over.visitId === undefined ? null : over.visitId },
    status: over.status ?? 'OPEN',
    ack: null,
    closed: null,
    notes: [],
  } as WhEventWithStatus;
}

const run = (e: WhEventWithStatus, s: NotifySession, h: NotifyHistory) => {
  const d = decideNotification(e, s, h);
  return { d, h: applyDecision(h, d, s.now) };
};

describe('decideNotification: eligibility', () => {
  it('shows a live, open, warn event the role can see', () => {
    expect(run(ev({}), session(), emptyHistory()).d.kind).toBe('show');
  });

  it('skips info severity', () => {
    expect(decideNotification(ev({ sev: 'info' }), session(), emptyHistory())).toEqual({
      kind: 'skip',
      reason: 'info',
    });
  });

  it('shows critical too', () => {
    const e = ev({
      category: 'compliance',
      type: 'on_belt',
      data: { trackId: null },
      sev: 'critical',
    });
    expect(decideNotification(e, session(), emptyHistory()).kind).toBe('show');
  });

  it('skips events that are not OPEN', () => {
    for (const status of ['ACK', 'CLOSED'] as const) {
      expect(decideNotification(ev({ status }), session(), emptyHistory())).toEqual({
        kind: 'skip',
        reason: 'not-open',
      });
    }
  });

  it('skips a category the role cannot view', () => {
    const e = ev({ category: 'security', type: 'door_open_idle', data: { minutes: 9 } });
    expect(decideNotification(e, session({ role: 'HQ_VIEWER' }), emptyHistory())).toEqual({
      kind: 'skip',
      reason: 'hidden',
    });
    expect(decideNotification(e, session({ role: 'SECURITY' }), emptyHistory()).kind).toBe('show');
  });

  it('skips while the source is not live, never went live, or is inside the connect backfill', () => {
    const e = ev({});
    const skip = (reason: string) => ({ kind: 'skip', reason });
    expect(decideNotification(e, session({ live: false }), emptyHistory())).toEqual(
      skip('not-live'),
    );
    expect(decideNotification(e, session({ liveSince: null }), emptyHistory())).toEqual(
      skip('not-live'),
    );
    expect(
      decideNotification(e, session({ liveSince: T - (BACKFILL_MS - 1) }), emptyHistory()),
    ).toEqual(skip('backfill'));
    expect(
      decideNotification(e, session({ liveSince: T - BACKFILL_MS }), emptyHistory()).kind,
    ).toBe('show');
  });
});

describe('decideNotification: one toast per (category, type, bay) per 60 s', () => {
  it('skips the same key inside 60 s and allows it after', () => {
    const s = session();
    const first = run(ev({}), s, emptyHistory());
    expect(first.d.kind).toBe('show');
    const again = run(ev({}), { ...s, now: T + DEDUPE_MS - 1 }, first.h);
    expect(again.d).toEqual({ kind: 'skip', reason: 'duplicate' });
    expect(run(ev({}), { ...s, now: T + DEDUPE_MS }, first.h).d.kind).toBe('show');
  });

  it('treats another bay or another type as a new key', () => {
    const s = session();
    const ppe = (bay: string) => ev({ category: 'ppe', type: 'violation', data: PPE, bay });
    const a = run(ppe('B01'), s, emptyHistory());
    const otherBay = run(ppe('B02'), s, a.h);
    expect(otherBay.d.kind).toBe('show');
    const staging = ev({
      category: 'staging',
      type: 'pallet_wait',
      data: { palletsWaiting: 3, oldestWaitSec: 200 },
      bay: 'B01',
    });
    expect(run(staging, s, otherBay.h).d.kind).toBe('show');
  });
});

describe('decideNotification: hygiene and belt of one visit collapse', () => {
  const visit = 'V-2026-1';

  it('updates one toast with a live count inside 5 minutes, across hygiene and belt', () => {
    const s = session();
    const a = run(ev({ visitId: visit }), s, emptyHistory());
    expect(a.d.kind).toBe('show');
    const b = run(ev({ type: 'open_tape', visitId: visit }), { ...s, now: T + 1_000 }, a.h);
    expect(b.d.kind).toBe('update');
    const belt = ev({
      category: 'belt',
      type: 'fall_off',
      data: { sku: null, pack: 'CASE' },
      visitId: visit,
    });
    const c = run(belt, { ...s, now: T + 2_000 }, b.h);
    expect(c.d.kind).toBe('update');
    if (c.d.kind === 'update') {
      expect(c.d.toast.count).toBe(3);
      expect(c.d.toast.id).toBe(a.h.active[0]?.id);
      expect(c.d.toast.eventId).toBe(belt.id);
    }
    expect(c.h.active).toHaveLength(1);
  });

  it('counts the same type too (the 60 s rule is for events that do not collapse)', () => {
    const s = session();
    const a = run(ev({ visitId: visit }), s, emptyHistory());
    expect(run(ev({ visitId: visit }), { ...s, now: T + 500 }, a.h).d.kind).toBe('update');
  });

  it('starts a new toast after the 5-minute window, and for another visit', () => {
    const s = session();
    const a = run(ev({ visitId: visit }), s, emptyHistory());
    const late = run(
      ev({ type: 'torn_sack', visitId: visit }),
      { ...s, now: T + COLLAPSE_MS },
      a.h,
    );
    expect(late.d.kind).toBe('show');
    const other = run(
      ev({ type: 'torn_sack', visitId: 'V-2026-2' }),
      { ...s, now: T + 1_000 },
      a.h,
    );
    expect(other.d.kind).toBe('show');
  });

  it('escalates the collapsed toast to critical and keeps the newest event as the target', () => {
    const s = session();
    const a = run(ev({ visitId: visit }), s, emptyHistory());
    const crit = ev({ type: 'torn_sack', visitId: visit, sev: 'critical' });
    const b = run(crit, { ...s, now: T + 1_000 }, a.h);
    expect(b.d.kind).toBe('update');
    if (b.d.kind === 'update') {
      expect(b.d.toast.sev).toBe('critical');
      expect(b.d.toast.eventId).toBe(crit.id);
    }
  });

  it('does not collapse other categories or events without a visit', () => {
    const s = session();
    const ppe = (bay: string) =>
      ev({ category: 'ppe', type: 'violation', data: PPE, visitId: visit, bay });
    const a = run(ppe('B01'), s, emptyHistory());
    const b = run(ppe('B02'), { ...s, now: T + 1 }, a.h);
    expect(b.d.kind).toBe('show');
    const c = run(ev({ visitId: null, bay: 'B06' }), { ...s, now: T + 2 }, b.h);
    const d = run(ev({ type: 'open_tape', visitId: null, bay: 'B06' }), { ...s, now: T + 3 }, c.h);
    expect(d.d.kind).toBe('show');
  });
});

describe('decideNotification: at most 3 toasts', () => {
  const fill = (sev: Severity) => {
    let h = emptyHistory();
    for (const bay of ['B01', 'B02', 'B03']) h = run(ev({ bay, sev }), session(), h).h;
    return h;
  };

  it('evicts the oldest warn toast to show a fourth', () => {
    const h = fill('warn');
    expect(h.active).toHaveLength(MAX_TOASTS);
    const d = decideNotification(ev({ bay: 'B04' }), session({ now: T + 10 }), h);
    expect(d.kind).toBe('show');
    if (d.kind === 'show') expect(d.evict).toBe(h.active[0]?.id);
    expect(applyDecision(h, d, T + 10).active).toHaveLength(MAX_TOASTS);
  });

  it('never evicts a critical toast for a warn event', () => {
    expect(
      decideNotification(ev({ bay: 'B04' }), session({ now: T + 10 }), fill('critical')),
    ).toEqual({
      kind: 'skip',
      reason: 'no-room',
    });
  });

  it('lets a critical event displace the oldest critical toast when all three are critical', () => {
    const h = fill('critical');
    const d = decideNotification(ev({ bay: 'B04', sev: 'critical' }), session({ now: T + 10 }), h);
    expect(d.kind).toBe('show');
    if (d.kind === 'show') expect(d.evict).toBe(h.active[0]?.id);
  });

  it('frees a slot when a toast is dismissed', () => {
    const h = fill('warn');
    const id = h.active[1]?.id ?? '';
    const freed = removeToast(h, id);
    expect(freed.active).toHaveLength(2);
    expect(removeToast(freed, id)).toBe(freed);
    expect(decideNotification(ev({ bay: 'B04' }), session({ now: T + 10 }), freed)).toMatchObject({
      kind: 'show',
      evict: null,
    });
  });
});

describe('toastDuration', () => {
  it('warn lasts 8 s, critical until dismissed', () => {
    expect(toastDuration('warn')).toBe(WARN_DURATION_MS);
    expect(WARN_DURATION_MS).toBe(8_000);
    expect(toastDuration('critical')).toBe(Infinity);
  });
});
