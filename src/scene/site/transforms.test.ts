// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  bayToSite,
  faceYaw,
  headingToRotationY,
  siteToBay,
  type DoorOrigin,
  type Face,
  type Vec3,
} from './transforms';

const FLOOR = 1.2;
const door: DoorOrigin = { X: 10, Z: -20 };
const p: Vec3 = { x: 2, y: 5, z: 0.5 };
const FACES: Face[] = ['S', 'N', 'E', 'W'];

describe('bayToSite (docs/04 section 2.1)', () => {
  it('face S: X = Xd + x, Z = Zd - y, Y = floorLevel + z', () => {
    expect(bayToSite('S', door, p, FLOOR)).toEqual({ X: 12, Y: 1.7, Z: -25 });
  });
  it('face N: X = Xd - x, Z = Zd + y', () => {
    expect(bayToSite('N', door, p, FLOOR)).toEqual({ X: 8, Y: 1.7, Z: -15 });
  });
  it('face E: X = Xd - y, Z = Zd - x', () => {
    expect(bayToSite('E', door, p, FLOOR)).toEqual({ X: 5, Y: 1.7, Z: -22 });
  });
  it('face W: X = Xd + y, Z = Zd + x', () => {
    expect(bayToSite('W', door, p, FLOOR)).toEqual({ X: 15, Y: 1.7, Z: -18 });
  });
  it('places y < 0 (outside) at yard grade', () => {
    const s = bayToSite('S', door, { x: 0, y: -3, z: 0.4 }, FLOOR);
    expect(s).toEqual({ X: 10, Y: 0.4, Z: -17 });
  });
  it('puts the door origin at dock floor level', () => {
    for (const f of FACES) {
      expect(bayToSite(f, door, { x: 0, y: 0, z: 0 }, FLOOR)).toEqual({ X: 10, Y: FLOOR, Z: -20 });
    }
  });
});

describe('siteToBay round trips', () => {
  const samples: Vec3[] = [
    { x: 0, y: 0, z: 0 },
    { x: -2.5, y: 7.25, z: 1.8 },
    { x: 3, y: -4, z: 0.3 },
    { x: 1.1, y: 33, z: 0 },
  ];
  for (const f of FACES) {
    it(`face ${f}: siteToBay(bayToSite(p)) = p`, () => {
      for (const s of samples) {
        const back = siteToBay(f, door, bayToSite(f, door, s, FLOOR), FLOOR);
        expect(back.x).toBeCloseTo(s.x, 12);
        expect(back.y).toBeCloseTo(s.y, 12);
        expect(back.z).toBeCloseTo(s.z, 12);
      }
    });
  }
});

describe('heading -> rotation.y', () => {
  // three.js: rotation.y = t sends local (a, c) to X = a cos t + c sin t, Z = -a sin t + c cos t.
  // An object modelled facing bay +y has local forward (0, -1) (three -Z). With heading 0 it must point
  // along the bay +y direction in site coordinates.
  const forward = (t: number) => ({ X: -Math.sin(t), Z: -Math.cos(t) });
  for (const f of FACES) {
    it(`face ${f}: heading 0 points along bay +y`, () => {
      const origin = bayToSite(f, door, { x: 0, y: 0, z: 0 }, FLOOR);
      const ahead = bayToSite(f, door, { x: 0, y: 1, z: 0 }, FLOOR);
      const dir = forward(headingToRotationY(f, 0));
      expect(dir.X).toBeCloseTo(ahead.X - origin.X, 12);
      expect(dir.Z).toBeCloseTo(ahead.Z - origin.Z, 12);
    });
    it(`face ${f}: heading +pi/2 (CCW) points along bay -x`, () => {
      const origin = bayToSite(f, door, { x: 0, y: 0, z: 0 }, FLOOR);
      const left = bayToSite(f, door, { x: -1, y: 0, z: 0 }, FLOOR);
      const dir = forward(headingToRotationY(f, Math.PI / 2));
      expect(dir.X).toBeCloseTo(left.X - origin.X, 12);
      expect(dir.Z).toBeCloseTo(left.Z - origin.Z, 12);
    });
  }
  it('lists faceYaw per face (E/W derived from the position formulas, see transforms.ts)', () => {
    expect(faceYaw('S')).toBe(0);
    expect(faceYaw('N')).toBeCloseTo(Math.PI, 12);
    expect(faceYaw('E')).toBeCloseTo(Math.PI / 2, 12);
    expect(faceYaw('W')).toBeCloseTo(-Math.PI / 2, 12);
  });
});
