import { describe, expect, it } from 'vitest';
import type { Role } from '@/domain';
import { canAccessEvents, canAccessReports, canExportReports } from './rbac';

// Route matrix of t22 spec section 2. Columns: events, reports, export.
const MATRIX: Record<Role, [events: boolean, reports: boolean, exportCsv: boolean]> = {
  HQ_VIEWER: [true, true, true],
  DC_MANAGER: [true, true, true],
  SHIFT_SUPERVISOR: [true, true, false],
  SECURITY: [true, false, false],
  ADMIN: [true, true, true],
  KIOSK: [false, false, false],
};

describe('events and reports route access', () => {
  it.each(Object.entries(MATRIX) as [Role, [boolean, boolean, boolean]][])(
    '%s',
    (role, [events, reports, exportCsv]) => {
      expect(canAccessEvents(role)).toBe(events);
      expect(canAccessReports(role)).toBe(reports);
      expect(canExportReports(role)).toBe(exportCsv);
    },
  );

  it('export implies report access', () => {
    for (const role of Object.keys(MATRIX) as Role[]) {
      if (canExportReports(role)) expect(canAccessReports(role)).toBe(true);
    }
  });
});
