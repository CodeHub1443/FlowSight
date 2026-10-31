// @vitest-environment node
import { BoxGeometry, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { bracketGeometry } from './brackets';

describe('selection bracket box (docs/06 D8)', () => {
  it('has three ticks on each of the 8 corners', () => {
    const one = new BoxGeometry(1, 1, 1).getAttribute('position').count;
    expect(bracketGeometry(6, 3, 15).getAttribute('position').count).toBe(8 * 3 * one);
  });

  it('spans the box and stands on the floor, centred on x and z', () => {
    const g = bracketGeometry(6, 3, 15.5);
    g.computeBoundingBox();
    const size = g.boundingBox?.getSize(new Vector3());
    const centre = g.boundingBox?.getCenter(new Vector3());
    expect(size?.x).toBeCloseTo(6.11, 6);
    expect(size?.y).toBeCloseTo(3.11, 6);
    expect(size?.z).toBeCloseTo(15.61, 6);
    expect(centre?.x).toBeCloseTo(0, 6);
    expect(centre?.y).toBeCloseTo(1.5, 6);
    expect(centre?.z).toBeCloseTo(0, 6);
  });

  it('leaves the edges open: the ticks cover well under half of each side', () => {
    const g = bracketGeometry(6, 3, 15);
    const pos = g.getAttribute('position');
    let inMiddle = 0;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getZ(i)) < 4) inMiddle++;
    }
    expect(inMiddle).toBe(0);
  });
});
