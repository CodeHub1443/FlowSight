import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyLifecycleTo,
  createAlertStore,
  MAX_EVENTS,
  selectOpenAlerts,
  selectUnreadCount,
  type AlertStore,
} from './alertStore';
import { makeEvent, makeLifecycle, ulid } from './testUtils';

let store: AlertStore;
beforeEach(() => {
  store = createAlertStore();
});
const s = () => store.getState();
const open = (id: string) => ({
  ...makeEvent(id),
  status: 'OPEN' as const,
  ack: null,
  closed: null,
  notes: [],
});

describe('dedupe', () => {
  it('keeps one entry per id and does not reset status or unread on a duplicate', () => {
    s().ingestEvent(makeEvent(ulid(1)));
    s().applyLifecycle(makeLifecycle(ulid(1), 'ACK', '2026-10-24T19:52:10+06:00'));
    s().markAllRead();
    s().ingestEvent(makeEvent(ulid(1)));
    expect(Object.keys(s().events)).toHaveLength(1);
    expect(s().events[ulid(1)]?.status).toBe('ACK');
    expect(s().duplicates).toBe(1);
    expect(selectUnreadCount(s())).toBe(0);
  });
});

describe('lifecycle', () => {
  beforeEach(() => s().ingestEvent(makeEvent(ulid(1))));

  it('ACK sets ack, CLOSED sets closed with the note', () => {
    s().applyLifecycle(makeLifecycle(ulid(1), 'ACK', '2026-10-24T19:52:10+06:00'));
    const acked = s().events[ulid(1)];
    expect(acked?.status).toBe('ACK');
    expect(acked?.ack).toEqual({ by: 'Shift Supervisor B', at: '2026-10-24T19:52:10+06:00' });

    s().applyLifecycle(
      makeLifecycle(ulid(1), 'CLOSED', '2026-10-24T19:55:00+06:00', 'case removed'),
    );
    const closed = s().events[ulid(1)];
    expect(closed?.status).toBe('CLOSED');
    expect(closed?.closed).toEqual({
      by: 'Shift Supervisor B',
      at: '2026-10-24T19:55:00+06:00',
      note: 'case removed',
    });
  });

  it('a note with unchanged status is appended and leaves the status alone', () => {
    s().applyLifecycle(makeLifecycle(ulid(1), 'ACK', '2026-10-24T19:52:10+06:00'));
    s().applyLifecycle(makeLifecycle(ulid(1), 'ACK', '2026-10-24T19:53:00+06:00', 'checking'));
    const e = s().events[ulid(1)];
    expect(e?.status).toBe('ACK');
    expect(e?.notes).toEqual([
      { by: 'Shift Supervisor B', at: '2026-10-24T19:53:00+06:00', text: 'checking' },
    ]);
  });

  it('ignores a repeated status without a note and backwards transitions', () => {
    s().applyLifecycle(makeLifecycle(ulid(1), 'CLOSED', '2026-10-24T19:55:00+06:00', 'done'));
    const before = s().events[ulid(1)];
    s().applyLifecycle(makeLifecycle(ulid(1), 'CLOSED', '2026-10-24T19:56:00+06:00'));
    s().applyLifecycle(makeLifecycle(ulid(1), 'ACK', '2026-10-24T19:57:00+06:00'));
    expect(s().events[ulid(1)]).toBe(before);
  });

  it('ignores an update older than the last one applied', () => {
    s().applyLifecycle(makeLifecycle(ulid(1), 'ACK', '2026-10-24T19:52:10+06:00'));
    s().applyLifecycle(makeLifecycle(ulid(1), 'ACK', '2026-10-24T19:50:00+06:00', 'late note'));
    expect(s().events[ulid(1)]?.notes).toEqual([]);
  });

  it('parks an update that arrives before its event and applies it when the event arrives', () => {
    s().applyLifecycle(makeLifecycle(ulid(2), 'ACK', '2026-10-24T19:52:10+06:00'));
    expect(s().events[ulid(2)]).toBeUndefined();
    s().ingestEvent(makeEvent(ulid(2)));
    expect(s().events[ulid(2)]?.status).toBe('ACK');
    expect(s().pending[ulid(2)]).toBeUndefined();
  });

  it('closing straight from OPEN still records an ack', () => {
    const closed = applyLifecycleTo(
      open(ulid(1)),
      makeLifecycle(ulid(1), 'CLOSED', '2026-10-24T19:55:00+06:00'),
    );
    expect(closed.ack?.at).toBe('2026-10-24T19:55:00+06:00');
    expect(closed.closed?.note).toBe('');
  });
});

describe('open set and unread', () => {
  it('open means not closed, and unread counts live events only', () => {
    s().ingestEvent(makeEvent(ulid(1)));
    s().ingestEvent(makeEvent(ulid(2)));
    s().mergeEvents([open(ulid(3))]);
    expect(selectUnreadCount(s())).toBe(2);
    s().applyLifecycle(makeLifecycle(ulid(2), 'CLOSED', '2026-10-24T19:55:00+06:00'));
    expect(
      selectOpenAlerts(s())
        .map((e) => e.id)
        .sort(),
    ).toEqual([ulid(1), ulid(3)].sort());
    s().markRead(ulid(1));
    expect(selectUnreadCount(s())).toBe(0);
  });

  it('markAllRead clears everything', () => {
    s().ingestEvent(makeEvent(ulid(1)));
    s().ingestEvent(makeEvent(ulid(2)));
    expect(selectUnreadCount(s())).toBe(2);
    s().markAllRead();
    expect(selectUnreadCount(s())).toBe(0);
  });

  it('unread honours the role matrix', () => {
    s().ingestEvent(
      makeEvent(ulid(1), {
        category: 'roster',
        type: 'captain_absent',
        data: { employeeId: null, minutes: 3 },
      }),
    );
    s().ingestEvent(makeEvent(ulid(2)));
    expect(selectUnreadCount(s(), { role: 'DC_MANAGER' })).toBe(2);
    expect(selectUnreadCount(s(), { role: 'KIOSK' })).toBe(1);
  });

  it('mergeEvents keeps the more advanced status', () => {
    s().ingestEvent(makeEvent(ulid(1)));
    s().applyLifecycle(makeLifecycle(ulid(1), 'ACK', '2026-10-24T19:52:10+06:00'));
    s().mergeEvents([open(ulid(1))]);
    expect(s().events[ulid(1)]?.status).toBe('ACK');
    s().mergeEvents([
      {
        ...open(ulid(1)),
        status: 'CLOSED',
        closed: { by: 'x', at: '2026-10-24T20:00:00+06:00', note: '' },
      },
    ]);
    expect(s().events[ulid(1)]?.status).toBe('CLOSED');
  });

  it('is bounded', () => {
    for (let i = 0; i < MAX_EVENTS + 5; i++) s().ingestEvent(makeEvent(ulid(i % 1024)));
    expect(Object.keys(s().events).length).toBeLessThanOrEqual(MAX_EVENTS);
  });
});
