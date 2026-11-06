// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ReportBayRowSchema } from './schemas';
import { REMOVE, mutate } from './testing';

// Contract rev 1.3 (docs/03 section 6): ReportBayRow.avgOccupancyMin is additive and optional.

const row = {
  bay: 'B02',
  casesOut: 2410,
  casesIn: 380,
  trucks: 9,
  avgTatMin: 63,
  avgOccupancyMin: 41.5,
  beltSec: { runningLoaded: 1, runningEmpty: 2, stopped: 3, noTruck: 4, offline: 0 },
  damaged: 1,
  openTape: 0,
  tornSack: 0,
  wetStained: 0,
  fallOff: 0,
  ppe: 3,
  detentions: 1,
};

describe('ReportBayRow.avgOccupancyMin (rev 1.3)', () => {
  it('parses when present and keeps the value', () => {
    const r = ReportBayRowSchema.safeParse(row);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.avgOccupancyMin).toBe(41.5);
  });

  it('parses an older payload where the field is absent', () => {
    const r = ReportBayRowSchema.safeParse(mutate(row, ['avgOccupancyMin'], REMOVE));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.avgOccupancyMin).toBeUndefined();
  });

  it('parses null (no departed visit with both timestamps)', () => {
    const r = ReportBayRowSchema.safeParse(mutate(row, ['avgOccupancyMin'], null));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.avgOccupancyMin).toBeNull();
  });

  it('rejects a negative or non-numeric value', () => {
    expect(ReportBayRowSchema.safeParse(mutate(row, ['avgOccupancyMin'], -1)).success).toBe(false);
    expect(ReportBayRowSchema.safeParse(mutate(row, ['avgOccupancyMin'], '41')).success).toBe(
      false,
    );
  });
});
