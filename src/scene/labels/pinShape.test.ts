// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { HEAD_RADIUS, PIN_HEIGHT, teardropProfile } from './pinShape';

describe('event pin shape (docs/06 D9)', () => {
  const profile = teardropProfile(24);

  it('is a 1.2 m teardrop from a point at the bottom to a closed crown', () => {
    expect(PIN_HEIGHT).toBe(1.2);
    expect(profile[0]?.toArray()).toEqual([0, 0]);
    expect(profile.at(-1)?.y).toBeCloseTo(PIN_HEIGHT, 6);
    expect(profile.at(-1)?.x).toBe(0);
  });

  it('widens monotonically up to the head, never beyond its radius', () => {
    const widest = Math.max(...profile.map((p) => p.x));
    expect(widest).toBeCloseTo(HEAD_RADIUS, 2);
    expect(widest).toBeLessThanOrEqual(HEAD_RADIUS);
    for (let i = 1; i < profile.length; i++) {
      expect(profile[i]?.y ?? 0).toBeGreaterThan(profile[i - 1]?.y ?? 0);
    }
  });
});
