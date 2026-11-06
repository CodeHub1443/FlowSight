import { makeDepot, PEAK } from '@/data/mock/core/testing';
import { report } from '@/data/mock/core/api/reports';
import type { Report, Role } from '@/domain';
import { ReportSchema } from '@/domain';

// Test helper: real reports from the simulator (the same code the MSW handlers use), validated by the contract schema.
// Stream time is PEAK = Sat 2026-10-24 19:20 Dhaka, so shift B of that day is in progress and shift A is complete.

export const NOW = PEAK;
export const DONE_SHIFT = { date: '2026-10-24', shift: 'A' } as const;
export const LIVE_SHIFT = { date: '2026-10-24', shift: 'B' } as const;

let depot: ReturnType<typeof makeDepot> | null = null;

/** A validated simulator report, or null for a period the simulator has no window for. */
export function simReport(
  kind: 'shift' | 'daily',
  period: { date: string; shift?: string },
  role: Role = 'DC_MANAGER',
): Report | null {
  depot ??= makeDepot(1, PEAK, 2);
  const q: Record<string, string> = { date: period.date };
  if (period.shift) q.shift = period.shift;
  const r = report(depot, kind, q, role);
  return r ? ReportSchema.parse(r) : null;
}
