import { describe, expect, it } from 'vitest';
import { EVENT_CATEGORIES, visibleCategories } from '@/lib/rbac';
import { MAX_EVENTS } from '@/stores/alertStore';
import { selectAlertGroups } from '@/features/live/kpiDetail/selectors';
import type { Severity, SiteState, WhEvent } from '@/domain';
import { BACKFILL_MAX_EVENTS, SimController, type Evt } from './controller';
import type { SimMessage } from './types';

// 19.9b (decision D3): on connect the simulator sends every open alert, newest first, bounded only by the alertStore cap,
// so the KPI alert groups add up to kpi.openAlerts once the snapshot has landed.

function connected(prepare?: (c: SimController) => void) {
  const out: Evt[] = [];
  const c = new SimController((e) => out.push(e));
  c.handle({ t: 'init', seed: 1, scenario: 'peak', speed: 1, historyDays: 1 });
  prepare?.(c);
  out.length = 0;
  c.handle({ t: 'connect' });
  const items: SimMessage[] = out.flatMap((e) => (e.t === 'msgs' ? e.items : []));
  const events = items.flatMap((m) => (m.kind === 'event' ? [m.value as WhEvent] : []));
  const site = items.find((m) => m.kind === 'siteState')?.value as SiteState | undefined;
  return { c, items, events, site };
}

const SEVS: readonly Severity[] = ['critical', 'warn', 'info'];

describe('simulator connect backfill (D3)', () => {
  it('uses the alertStore retention cap', () => {
    expect(BACKFILL_MAX_EVENTS).toBe(MAX_EVENTS);
  });

  it('sends every open alert once, newest first, and nothing closed', () => {
    const { c, events } = connected();
    const store = c.currentDepot?.store;
    expect(store).toBeDefined();
    const openIds = store?.openIds() ?? [];
    expect(openIds.length).toBeGreaterThan(40); // more than the old 3 h / 40 cap would have sent
    expect(openIds.length).toBeLessThanOrEqual(BACKFILL_MAX_EVENTS);
    expect(new Set(events.map((e) => e.id))).toEqual(new Set(openIds));
    expect(events).toHaveLength(openIds.length);
    const ts = events.map((e) => Date.parse(e.ts));
    expect(ts).toEqual([...ts].sort((a, b) => b - a));
    for (const e of events) expect(store?.eventById.get(e.id)?.status).not.toBe('CLOSED');
  });

  it('per severity, the alert groups of the backfill equal kpi.openAlerts of the snapshot', () => {
    // the mock default role (DC_MANAGER) sees every category, so no role filter narrows the groups
    expect(visibleCategories('DC_MANAGER')).toEqual(EVENT_CATEGORIES);
    const { events, site } = connected();
    expect(site).toBeDefined();
    const groups = selectAlertGroups(events.map((e) => ({ ...e, status: 'OPEN' as const })));
    for (const sev of SEVS) {
      const sum = groups.reduce((n, g) => n + g[sev], 0);
      expect(sum, sev).toBe(site?.kpi.openAlerts[sev]);
    }
  });

  it('follows each acknowledged alert with its ACK lifecycle update', () => {
    const { c, items } = connected((ctl) => {
      const store = ctl.currentDepot?.store;
      const id = store?.openIds()[0];
      if (store && id) store.setStatus(id, 'ACK', 'u-test', ctl.currentDepot?.now ?? 0, null);
    });
    const acked = (c.currentDepot?.store.openIds() ?? []).filter(
      (id) => c.currentDepot?.store.eventById.get(id)?.status === 'ACK',
    );
    expect(acked.length).toBeGreaterThan(0);
    for (const id of acked) {
      const i = items.findIndex((m) => m.kind === 'event' && (m.value as WhEvent).id === id);
      const next = items[i + 1];
      expect(next?.kind).toBe('lifecycle');
      expect((next?.value as { id: string; status: string }).id).toBe(id);
      expect((next?.value as { id: string; status: string }).status).toBe('ACK');
    }
  });

  it('past the cap sends the newest BACKFILL_MAX_EVENTS open alerts', () => {
    const { c, events } = connected((ctl) => {
      const depot = ctl.currentDepot;
      const store = depot?.store;
      const template = store?.eventById.get(store.openIds()[0] ?? '');
      if (!depot || !store || !template) throw new Error('no open alert to copy');
      for (let i = 0; i < BACKFILL_MAX_EVENTS + 50; i++) {
        // addEvent sets status, ack, closed and notes itself
        store.addEvent({
          ...template,
          id: `test-${String(i).padStart(4, '0')}`,
          ts: new Date(depot.now - i * 1000).toISOString(),
        });
      }
    });
    const store = c.currentDepot?.store;
    const all = (store?.openIds() ?? [])
      .map((id) => store?.eventById.get(id))
      .filter((e) => e !== undefined)
      .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
    expect(all.length).toBeGreaterThan(BACKFILL_MAX_EVENTS);
    expect(events).toHaveLength(BACKFILL_MAX_EVENTS);
    expect(events.map((e) => e.id)).toEqual(all.slice(0, BACKFILL_MAX_EVENTS).map((e) => e.id));
  });
});
