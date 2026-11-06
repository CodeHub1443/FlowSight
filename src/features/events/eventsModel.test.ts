import { describe, expect, it } from 'vitest';
import type { WhEventWithStatus } from '@/domain';
import { selectAlertGroups } from '@/features/live/kpiDetail/selectors';
import { filterAlerts } from '@/stores/alertFilter';
import { makeEvent, ulid } from '@/stores/testUtils';
import {
  ROW_H,
  byNewest,
  effectiveFilters,
  groupRows,
  isDefaultFilters,
  matchesFilters,
  matchesText,
  mergeRows,
  newer,
  scrollToRow,
  windowRange,
} from './eventsModel';
import { defaultEventFilters } from './urlState';

const PPE = { trackId: null, role: 'WORKER' as const, missing: ['helmet' as const] };

let n = 100;
function ev(over: {
  category?: string;
  type?: string;
  data?: unknown;
  ts?: string;
  bay?: string | null;
  status?: WhEventWithStatus['status'];
  visitId?: string | null;
  sev?: WhEventWithStatus['sev'];
}): WhEventWithStatus {
  n += 1;
  const base = makeEvent(ulid(n), {
    category: over.category ?? 'hygiene',
    type: over.type ?? 'damaged',
    data: over.data ?? { sku: 'RIN-PB-1KG', pack: 'SACK' },
    bay: over.bay === undefined ? 'B02' : over.bay,
    ts: over.ts,
  });
  return {
    ...base,
    sev: over.sev ?? base.sev,
    refs: { ...base.refs, visitId: over.visitId === undefined ? null : over.visitId },
    status: over.status ?? 'OPEN',
    ack: null,
    closed: null,
    notes: [],
  } as WhEventWithStatus;
}

describe('windowRange', () => {
  it('renders the visible rows plus overscan, with spacers for the rest', () => {
    const w = windowRange(1000, ROW_H * 100, 480, ROW_H, 5);
    expect(w.start).toBe(95);
    expect(w.end).toBe(100 + 10 + 5);
    expect(w.padTop).toBe(95 * ROW_H);
    expect(w.padBottom).toBe((1000 - 115) * ROW_H);
    expect(w.totalHeight).toBe(1000 * ROW_H);
    expect(w.padTop + (w.end - w.start) * ROW_H + w.padBottom).toBe(w.totalHeight);
  });

  it('clamps at the top, at the end and for short lists', () => {
    expect(windowRange(1000, 0, 480, ROW_H, 5)).toMatchObject({ start: 0, end: 15, padTop: 0 });
    const end = windowRange(1000, 1000 * ROW_H, 480, ROW_H, 5);
    expect(end.end).toBe(1000);
    expect(end.padBottom).toBe(0);
    expect(windowRange(3, 0, 480)).toMatchObject({ start: 0, end: 3, padBottom: 0 });
    expect(windowRange(0, 0, 480)).toMatchObject({ start: 0, end: 0, totalHeight: 0 });
    expect(windowRange(10, -50, 480).start).toBe(0);
  });

  it('renders a bounded number of rows however long the list is', () => {
    const w = windowRange(100_000, ROW_H * 50_000, 960);
    expect(w.end - w.start).toBeLessThan(40);
  });
});

describe('scrollToRow', () => {
  it('scrolls only as far as needed', () => {
    expect(scrollToRow(2, 0, 480)).toBe(0);
    expect(scrollToRow(20, 0, 480)).toBe(20 * ROW_H + ROW_H - 480);
    expect(scrollToRow(1, 480, 480)).toBe(ROW_H);
  });
});

describe('filters', () => {
  const role = 'DC_MANAGER' as const;

  it('matchesFilters mirrors the server filters', () => {
    const e = ev({ bay: 'B03', ts: '2026-10-24T10:00:00+06:00' });
    const f = defaultEventFilters();
    expect(matchesFilters(e, f, role)).toBe(true);
    expect(matchesFilters(e, { ...f, bay: ['B01'] }, role)).toBe(false);
    expect(matchesFilters(e, { ...f, bay: ['B03'] }, role)).toBe(true);
    expect(matchesFilters(e, { ...f, status: ['CLOSED'] }, role)).toBe(false);
    expect(matchesFilters(e, { ...f, sev: ['critical'] }, role)).toBe(false);
    expect(matchesFilters(e, { ...f, category: ['hygiene'] }, role)).toBe(true);
    expect(matchesFilters(e, { ...f, category: ['ppe'] }, role)).toBe(false);
    expect(matchesFilters(e, { ...f, from: Date.parse('2026-10-24T10:00:01+06:00') }, role)).toBe(
      false,
    );
    expect(matchesFilters(e, { ...f, to: Date.parse('2026-10-24T10:00:00+06:00') }, role)).toBe(
      false,
    );
    expect(matchesFilters(e, { ...f, group: 'hygiene' }, role)).toBe(true);
    expect(matchesFilters(e, { ...f, group: 'ppe' }, role)).toBe(false);
  });

  it('drops categories the role cannot view', () => {
    const e = ev({ category: 'security', type: 'door_open_idle', data: { minutes: 9 } });
    expect(matchesFilters(e, defaultEventFilters(), 'HQ_VIEWER')).toBe(false);
    expect(matchesFilters(e, defaultEventFilters(), 'SECURITY')).toBe(true);
  });

  it('matches free text over title, plate and SKU, case-insensitively', () => {
    const e = ev({});
    expect(matchesText(e, '')).toBe(true);
    expect(matchesText(e, e.title.en.slice(0, 4).toUpperCase())).toBe(true);
    expect(matchesText(e, 'zzzz-nothing')).toBe(false);
    const withPlate = { ...e, refs: { ...e.refs, plateEn: 'DHAKA METRO-DA 11-2171' } };
    expect(matchesText(withPlate, 'metro-da')).toBe(true);
    expect(matchesText({ ...e, refs: { ...e.refs, sku: 'RIN-PB-1KG' } }, 'rin-pb')).toBe(true);
  });

  it('defaults the range to today only when CLOSED is included and no range is set', () => {
    const now = Date.parse('2026-10-24T12:00:00+06:00');
    const f = defaultEventFilters();
    expect(effectiveFilters(f, now)).toBe(f);
    const closed = effectiveFilters({ ...f, status: ['CLOSED'] }, now);
    expect(closed.from).toBe(Date.parse('2026-10-24T06:00:00+06:00'));
    expect(closed.to).toBeNull();
    const ranged = { ...f, status: ['CLOSED' as const], from: 5 };
    expect(effectiveFilters(ranged, now)).toBe(ranged);
  });

  it('isDefaultFilters', () => {
    expect(isDefaultFilters(defaultEventFilters())).toBe(true);
    expect(isDefaultFilters({ ...defaultEventFilters(), q: 'x' })).toBe(false);
    expect(isDefaultFilters({ ...defaultEventFilters(), groupBy: 'visit' })).toBe(false);
  });
});

describe('group counts', () => {
  it('equal the KPI popover selector for the same open set, per group', () => {
    const open = [
      ev({ category: 'ppe', type: 'violation', data: PPE }),
      ev({ category: 'ppe', type: 'violation', data: PPE }),
      ev({}),
      ev({ category: 'belt', type: 'fall_off', data: { sku: null, pack: 'CASE' } }),
      ev({ category: 'belt', type: 'empty_run', data: { minutes: 5 } }),
      ev({
        category: 'system',
        type: 'camera_offline',
        data: { cam: 'B01-BELT' },
        sev: 'critical',
      }),
    ];
    const rows = selectAlertGroups(filterAlerts(open, { role: 'DC_MANAGER' }), {
      includeEmpty: true,
    });
    for (const row of rows) {
      const onPage = open.filter((e) =>
        matchesFilters(e, { ...defaultEventFilters(), group: row.id }, 'DC_MANAGER'),
      );
      expect(onPage.length).toBe(row.total);
    }
    expect(rows.find((r) => r.id === 'hygiene')?.total).toBe(2);
    expect(rows.find((r) => r.id === 'ppe')?.total).toBe(2);
  });
});

describe('mergeRows', () => {
  const role = 'DC_MANAGER' as const;
  const f = defaultEventFilters();
  const a = ev({ ts: '2026-10-24T10:00:00+06:00' });
  const b = ev({ ts: '2026-10-24T09:00:00+06:00' });

  it('dedupes by id, newest first, and takes the more advanced copy', () => {
    const acked = { ...a, status: 'ACK' as const };
    const { rows, pending } = mergeRows([b, a], [acked], f, role, new Set(), new Set([a.id]));
    expect(rows.map((e) => e.id)).toEqual([a.id, b.id]);
    expect(rows[0]?.status).toBe('ACK');
    expect(pending).toEqual([]);
  });

  it('holds a new live event back until it is applied, and never shifts fetched rows', () => {
    const fresh = ev({ ts: '2026-10-24T11:00:00+06:00' });
    const base = new Set([a.id, b.id]);
    const held = mergeRows([a, b], [a, b, fresh], f, role, new Set(), base);
    expect(held.rows.map((e) => e.id)).toEqual([a.id, b.id]);
    expect(held.pending.map((e) => e.id)).toEqual([fresh.id]);
    const shown = mergeRows([a, b], [a, b, fresh], f, role, new Set([fresh.id]), base);
    expect(shown.rows.map((e) => e.id)).toEqual([fresh.id, a.id, b.id]);
    expect(shown.pending).toEqual([]);
  });

  it('does not call an older known event "new"', () => {
    const older = ev({ ts: '2026-10-23T09:00:00+06:00' });
    const r = mergeRows([a], [a, older], f, role, new Set(), new Set([a.id, older.id]));
    expect(r.pending).toEqual([]);
    expect(r.rows.map((e) => e.id)).toEqual([a.id]);
  });

  it('ignores live events that do not match the filters or the role', () => {
    const wrongBay = ev({ bay: 'B07' });
    const hidden = ev({ category: 'security', type: 'door_open_idle', data: { minutes: 3 } });
    const r = mergeRows([], [wrongBay, hidden], { ...f, bay: ['B01'] }, 'HQ_VIEWER', new Set());
    expect(r.rows).toEqual([]);
    expect(r.pending).toEqual([]);
  });

  it('applies the group filter to fetched and live rows', () => {
    const ppe = ev({ category: 'ppe', type: 'violation', data: PPE });
    const r = mergeRows([a, ppe], [], { ...f, group: 'ppe' }, role, new Set());
    expect(r.rows.map((e) => e.id)).toEqual([ppe.id]);
  });

  it('newer() never moves a status backwards', () => {
    expect(newer({ ...a, status: 'CLOSED' }, a).status).toBe('CLOSED');
    expect(newer(a, { ...a, status: 'ACK' }).status).toBe('ACK');
    expect([b, a].sort(byNewest)[0]).toBe(a);
  });
});

describe('groupRows', () => {
  const v1a = ev({ visitId: 'V-1', ts: '2026-10-24T10:03:00+06:00' });
  const v1b = ev({ visitId: 'V-1', type: 'open_tape', ts: '2026-10-24T10:02:00+06:00' });
  const solo = ev({ visitId: 'V-2', ts: '2026-10-24T10:01:00+06:00' });
  const none = ev({ visitId: null, ts: '2026-10-24T10:00:00+06:00' });
  const rows = [v1a, v1b, solo, none];

  it('is a plain list when off', () => {
    expect(groupRows(rows, false, new Set()).map((r) => r.key)).toEqual(rows.map((e) => e.id));
  });

  it('collapses a truck with several events into one group row at its newest event', () => {
    const out = groupRows(rows, true, new Set());
    expect(out.map((r) => r.kind)).toEqual(['group', 'event', 'event']);
    expect(out[0]).toMatchObject({ kind: 'group', visitId: 'V-1', count: 2, expanded: false });
    expect(out.map((r) => r.key)).toEqual(['visit:V-1', solo.id, none.id]);
  });

  it('lists the events under an expanded group', () => {
    const out = groupRows(rows, true, new Set(['V-1']));
    expect(out.map((r) => r.key)).toEqual(['visit:V-1', v1a.id, v1b.id, solo.id, none.id]);
    expect(out[1]).toMatchObject({ child: true });
  });
});
