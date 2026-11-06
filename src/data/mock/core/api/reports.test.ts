import { describe, expect, it } from 'vitest';
import { ReportSchema } from '@/domain';
import { MIN } from '../clock';
import { makeDepot, PEAK } from '../testing';
import type { VisitRec } from '../types';
import { avgOccupancyMin, report } from './reports';

const visit = (dockedAt: number | null, departedAt: number | null): VisitRec =>
  ({ dockedAt, departedAt }) as VisitRec;

describe('avgOccupancyMin (contract rev 1.3)', () => {
  it('is the mean of departedAt - dockedAt in minutes', () => {
    expect(avgOccupancyMin([visit(0, 30 * MIN), visit(10 * MIN, 60 * MIN)])).toBe(40);
  });
  it('is null when no departed visit has both timestamps', () => {
    expect(avgOccupancyMin([])).toBeNull();
    expect(avgOccupancyMin([visit(null, 5 * MIN), visit(0, null)])).toBeNull();
  });
});

describe('mock shift report', { timeout: 60_000 }, () => {
  const depot = makeDepot(1, PEAK, 2);
  it('validates and fills avgOccupancyMin for bays with departed visits', () => {
    const r = report(
      depot,
      'daily',
      { date: depot.clock.businessDay(depot.now - 24 * 60 * MIN) },
      'DC_MANAGER',
    );
    expect(r).not.toBeNull();
    const parsed = ReportSchema.safeParse(r);
    expect(parsed.success).toBe(true);
    const filled = (r?.bays ?? []).filter((b) => typeof b.avgOccupancyMin === 'number');
    expect(filled.length).toBeGreaterThan(0);
    for (const b of filled) expect(b.avgOccupancyMin).toBeGreaterThan(0);
  });
});
