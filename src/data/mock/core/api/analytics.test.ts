import { describe, expect, it } from 'vitest';
import { DAY, HOUR } from '../clock';
import { makeDepot, PEAK } from '../testing';
import { throughput } from './analytics';

// task 20.10 D2: the simulator keeps its history for a fixed number of days; before that the count is unknown (null), never 0.
describe('throughput before the history starts', { timeout: 60_000 }, () => {
  const depot = makeDepot(1, PEAK, 2);
  const start = depot.historyStartMs;

  it('returns null for buckets before the history and counts after it', () => {
    const r = throughput(depot, { bucket: 'hour' }, start - 3 * HOUR, start + 3 * HOUR);
    expect(r.series.length).toBeGreaterThan(0);
    for (const s of r.series) {
      expect(s.points).toHaveLength(6);
      expect(s.points.slice(0, 3).every((p) => p.v === null)).toBe(true);
      expect(s.points.slice(3).every((p) => typeof p.v === 'number')).toBe(true);
    }
  });

  it('day buckets before the history are null too', () => {
    const r = throughput(depot, { bucket: 'day' }, start - 2 * DAY, start + DAY);
    for (const s of r.series) {
      expect(s.points[0]?.v).toBeNull();
      expect(typeof s.points[s.points.length - 1]?.v).toBe('number');
    }
  });

  it('a window inside the history has no nulls', () => {
    const r = throughput(
      depot,
      { bucket: 'hour' },
      depot.liveStartMs - 6 * HOUR,
      depot.liveStartMs,
    );
    for (const s of r.series) expect(s.points.every((p) => p.v !== null)).toBe(true);
  });
});
