import { describe, expect, it } from 'vitest';
import { RoleSchema, type Role, type WhEventWithStatus } from '@/domain';
import {
  canActOnCategory,
  canViewCategory,
  categoryAccess,
  EVENT_CATEGORIES,
  filterAlerts,
  visibleCategories,
  type EventCategory,
} from './alertFilter';
import { makeEvent, ulid } from './testUtils';

// docs/01 section 2, transcribed independently of the implementation. Columns are
// HQ_VIEWER, DC_MANAGER, SHIFT_SUPERVISOR, SECURITY, ADMIN, KIOSK.
const DOC: Record<EventCategory, string> = {
  truck: 'VAAAAV',
  belt: 'VAAVAV',
  hygiene: 'VAAAAV',
  handling: 'VAAVA-',
  ppe: 'VAAAAV',
  compliance: 'VAAAAV',
  roster: '-AA-A-',
  staging: 'VAA-AV',
  security: '-AVAA-',
  system: 'VAAAAV',
};
const ROLES: Role[] = ['HQ_VIEWER', 'DC_MANAGER', 'SHIFT_SUPERVISOR', 'SECURITY', 'ADMIN', 'KIOSK'];

describe('category matrix', () => {
  it('covers exactly the ten catalogue categories and all six roles', () => {
    expect([...EVENT_CATEGORIES].sort()).toEqual(Object.keys(DOC).sort());
    expect([...RoleSchema.options].sort()).toEqual([...ROLES].sort());
  });

  it.each(Object.entries(DOC))('matches docs/01 for %s', (category, row) => {
    ROLES.forEach((role, i) => {
      const cell = row[i];
      const expected = cell === '-' ? null : cell;
      expect(categoryAccess(role, category as EventCategory), `${role}/${category}`).toBe(expected);
    });
  });

  it('view and act helpers follow V / A / -', () => {
    expect(canViewCategory('KIOSK', 'handling')).toBe(false);
    expect(canViewCategory('SECURITY', 'security')).toBe(true);
    expect(canActOnCategory('SHIFT_SUPERVISOR', 'security')).toBe(false);
    expect(canActOnCategory('SECURITY', 'security')).toBe(true);
    expect(visibleCategories('KIOSK')).not.toContain('roster');
    expect(visibleCategories('DC_MANAGER')).toHaveLength(10);
  });
});

const withStatus = (e: ReturnType<typeof makeEvent>, status: WhEventWithStatus['status']) =>
  ({ ...e, status, ack: null, closed: null, notes: [] }) as WhEventWithStatus;

describe('filterAlerts', () => {
  const hygiene = withStatus(makeEvent(ulid(1)), 'OPEN');
  const security = withStatus(
    makeEvent(ulid(2), {
      category: 'security',
      type: 'door_open_idle',
      data: { minutes: 4 },
      bay: 'B03',
    }),
    'ACK',
  );
  const roster = withStatus(
    makeEvent(ulid(3), {
      category: 'roster',
      type: 'captain_absent',
      data: { employeeId: null, minutes: 6 },
    }),
    'OPEN',
  );
  const closed = withStatus(makeEvent(ulid(4)), 'CLOSED');
  const all = [hygiene, security, roster, closed];

  it('hides closed events by default', () => {
    expect(filterAlerts(all, {}).map((e) => e.id)).not.toContain(closed.id);
  });

  it('applies the role matrix', () => {
    const cats = (role: Role) =>
      filterAlerts(all, { role })
        .map((e) => e.category)
        .sort();
    expect(cats('KIOSK')).toEqual(['hygiene']);
    expect(cats('SECURITY')).toEqual(['hygiene', 'security']);
    expect(cats('DC_MANAGER')).toEqual(['hygiene', 'roster', 'security']);
    expect(cats('HQ_VIEWER')).toEqual(['hygiene']);
  });

  it('narrows by category, bay and status without widening past the role', () => {
    expect(filterAlerts(all, { role: 'DC_MANAGER', categories: ['security'] })).toEqual([security]);
    expect(filterAlerts(all, { role: 'KIOSK', categories: ['security'] })).toEqual([]);
    expect(filterAlerts(all, { bay: 'B03' })).toEqual([security]);
    expect(filterAlerts(all, { statuses: ['CLOSED'] })).toEqual([closed]);
  });

  it('sorts newest first', () => {
    const older = withStatus(makeEvent(ulid(5), { ts: '2026-10-24T19:00:00+06:00' }), 'OPEN');
    const newer = withStatus(makeEvent(ulid(6), { ts: '2026-10-24T19:30:00+06:00' }), 'OPEN');
    expect(filterAlerts([older, newer]).map((e) => e.id)).toEqual([newer.id, older.id]);
  });
});
