// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  addForklift,
  addPerson,
  addTruck,
  decideClick,
  DRAG_PX,
  HOVER_INTERVAL_MS,
  HoverGate,
  isDrag,
  isR3fClickDrag,
  PICK_MIN_ANGLE,
  PickList,
  rayCapsule,
  type Ray,
} from './pick';

const ray = (o: [number, number, number], to: [number, number, number]): Ray => {
  const d = [to[0] - o[0], to[1] - o[1], to[2] - o[2]];
  const len = Math.hypot(d[0] as number, d[1] as number, d[2] as number);
  return {
    ox: o[0],
    oy: o[1],
    oz: o[2],
    dx: (d[0] as number) / len,
    dy: (d[1] as number) / len,
    dz: (d[2] as number) / len,
  };
};

describe('rayCapsule', () => {
  it('hits a sphere on the ray at the distance of its middle', () => {
    const t = rayCapsule(ray([0, 0, 0], [0, 0, -10]), 0, 0, -10, 0, 0, -10, 1);
    expect(t).toBeCloseTo(10, 6);
  });

  it('misses a sphere further from the ray than its radius, hits one just inside', () => {
    const r = ray([0, 0, 0], [0, 0, -1]);
    expect(rayCapsule(r, 1.01, 0, -10, 1.01, 0, -10, 1)).toBe(-1);
    expect(rayCapsule(r, 0.99, 0, -10, 0.99, 0, -10, 1)).toBeGreaterThan(0);
  });

  it('ignores a shape behind the origin', () => {
    expect(rayCapsule(ray([0, 0, 0], [0, 0, -1]), 0, 0, 10, 0, 0, 10, 1)).toBe(-1);
  });

  it('hits a capsule along its length, not only at its ends', () => {
    // a horizontal capsule from x -5 to 5 at z -10; the ray passes through its middle and near one end
    const mid = rayCapsule(ray([0, 0, 0], [0, 0, -1]), -5, 0, -10, 5, 0, -10, 0.5);
    const end = rayCapsule(ray([0, 0, 0], [4.8, 0, -10]), -5, 0, -10, 5, 0, -10, 0.5);
    expect(mid).toBeCloseTo(10, 5);
    expect(end).toBeGreaterThan(0);
    // past the cap it is a miss
    expect(rayCapsule(ray([0, 0, 0], [5.6, 0, -10]), -5, 0, -10, 5, 0, -10, 0.5)).toBe(-1);
  });

  it('a ray parallel to the capsule axis hits when inside the radius', () => {
    expect(rayCapsule(ray([0, 0.2, 0], [10, 0.2, 0]), 2, 0, 0, 8, 0, 0, 0.5)).toBeGreaterThan(0);
    expect(rayCapsule(ray([0, 0.8, 0], [10, 0.8, 0]), 2, 0, 0, 8, 0, 0, 0.5)).toBe(-1);
  });
});

describe('PickList.nearest', () => {
  const origin: [number, number, number] = [0, 50, 80];

  it('returns the nearest of two bounds on the same ray', () => {
    const list = new PickList();
    list.addSphere('person', 'far', 0, 0, 0, 1);
    list.addSphere('forklift', 'near', 0, 25, 40, 1);
    // aim at the far one: the near sphere sits on the line from origin to (0, 0, 0)
    const idx = list.nearest(ray(origin, [0, 0, 0]));
    expect(list.ids[idx]).toBe('near');
  });

  it('is not the first added: order does not decide', () => {
    const a = new PickList();
    a.addSphere('person', 'x', 0, 25, 40, 1);
    a.addSphere('person', 'y', 0, 0, 0, 1);
    const b = new PickList();
    b.addSphere('person', 'y', 0, 0, 0, 1);
    b.addSphere('person', 'x', 0, 25, 40, 1);
    const r = ray(origin, [0, 0, 0]);
    expect(a.ids[a.nearest(r)]).toBe('x');
    expect(b.ids[b.nearest(r)]).toBe('x');
  });

  it('returns -1 when nothing is on the ray', () => {
    const list = new PickList();
    addPerson(list, 't-1', 30, 0, 0);
    expect(list.nearest(ray(origin, [0, 0, 0]))).toBe(-1);
    expect(new PickList().nearest(ray(origin, [0, 0, 0]))).toBe(-1);
  });

  it('refills in place: begin() empties the list', () => {
    const list = new PickList(2);
    for (let i = 0; i < 5; i++) list.addSphere('person', `p${i}`, i * 10, 0, 0, 1);
    expect(list.count).toBe(5);
    list.begin();
    expect(list.count).toBe(0);
    expect(list.nearest(ray(origin, [0, 0, 0]))).toBe(-1);
  });

  it('grows the bound with distance so a far figure can still be hit', () => {
    const list = new PickList();
    list.addSphere('person', 'far', 0, 0, -100, 0.1);
    // 0.5 m off the line at 180 m: a 0.1 m bound misses, the distance-grown one (180 * 0.006 = 1.08 m) hits
    const r = ray([0, 0, 80], [0.5, 0, -100]);
    expect(list.nearest(r, 0)).toBe(-1);
    expect(list.nearest(r, PICK_MIN_ANGLE)).toBe(0);
  });
});

describe('PickList.center', () => {
  it('is the middle of the bound (the debug probe puts it on screen)', () => {
    const list = new PickList();
    list.addCapsule('truck', 'V-1', 0, 2, 0, 4, 2, -8, 1);
    list.addSphere('camera', 'B01-DOCK', 3, 5, 7, 0.5);
    const c: [number, number, number] = [0, 0, 0];
    list.center(0, c);
    expect(c).toEqual([2, 2, -4]);
    list.center(1, c);
    expect(c).toEqual([3, 5, 7]);
  });
});

describe('actor bounds', () => {
  it('a person is hit through the chest, missed above the head or beside it', () => {
    const list = new PickList();
    addPerson(list, 't-3', 10, 1.2, -4);
    // straight down the +Z axis from the south at chest height
    expect(list.nearest(ray([10, 2.05, 40], [10, 2.05, -4]))).toBe(0);
    expect(list.nearest(ray([10, 5, 40], [10, 5, -4]), 0)).toBe(-1);
    expect(list.nearest(ray([12, 2.05, 40], [12, 2.05, -4]), 0)).toBe(-1);
  });

  it('a forklift is a capsule along its heading', () => {
    const facingNorth = new PickList();
    addForklift(facingNorth, 'f-1', 0, 0, 0, 0);
    // heading 0: long axis along Z. A ray across the X axis 0.8 m from the middle hits; the same ray when the
    // forklift is turned a quarter misses, because its length now lies along X
    expect(facingNorth.nearest(ray([30, 1, 0.6], [0, 1, 0.6]), 0)).toBe(0);
    const turned = new PickList();
    addForklift(turned, 'f-1', 0, 0, 0, Math.PI / 2);
    expect(turned.nearest(ray([30, 1, 2.4], [0, 1, 2.4]), 0)).toBe(-1);
    expect(turned.nearest(ray([30, 1, 0.3], [0, 1, 0.3]), 0)).toBe(0);
  });

  it('a truck covers its body from the rear sill to the cab, along its heading', () => {
    const list = new PickList();
    // rear at (0, 0, 0), heading 0 (rotation.y 0): the body runs towards -Z
    addTruck(list, 'V-1', 0, 0, 0, 0, 8.9);
    for (const z of [-2, -4.5, -7])
      expect(list.nearest(ray([30, 2.75, z], [0, 2.75, z]), 0)).toBe(0);
    expect(list.nearest(ray([30, 2.75, 4], [0, 2.75, 4]), 0)).toBe(-1);
    expect(list.nearest(ray([30, 2.75, -12], [0, 2.75, -12]), 0)).toBe(-1);
    // a quarter turn: the body runs towards -X (sin(pi/2) = 1)
    const turned = new PickList();
    addTruck(turned, 'V-1', 0, 0, 0, Math.PI / 2, 8.9);
    expect(turned.nearest(ray([-4.5, 2.75, 30], [-4.5, 2.75, 0]), 0)).toBe(0);
    expect(turned.nearest(ray([4.5, 2.75, 30], [4.5, 2.75, 0]), 0)).toBe(-1);
  });

  it('an actor in front of a truck wins the ray, and the truck wins where no actor stands', () => {
    const list = new PickList();
    addTruck(list, 'V-1', 0, 0, 0, 0, 8.9);
    addPerson(list, 't-9', 0, 0, 3);
    // from the south at 1.5 m: both bounds are on the ray, the person (nearer) wins over the truck behind it
    const through = ray([0, 1.5, 40], [0, 1.5, 0]);
    expect(list.ids[list.nearest(through)]).toBe('t-9');
    // aside from the person the same ray height reaches the truck
    const aside = ray([0.9, 2.75, 40], [0.9, 2.75, -3]);
    expect(list.ids[list.nearest(aside)]).toBe('V-1');
  });
});

describe('click and drag', () => {
  it('a movement of up to 4 px is a click, more is a drag', () => {
    expect(DRAG_PX).toBe(4);
    expect(isDrag(100, 100, 100, 100)).toBe(false);
    expect(isDrag(100, 100, 104, 100)).toBe(false);
    expect(isDrag(100, 100, 104.1, 100)).toBe(true);
  });

  it('measures the straight distance, not the larger axis', () => {
    expect(isDrag(0, 0, 3, 3)).toBe(true); // hypot = 4.24
    expect(isDrag(0, 0, 2, 3)).toBe(false); // hypot = 3.6
    expect(isDrag(0, 0, 0, 5)).toBe(true);
  });

  it('a drag is ignored even over an actor', () => {
    expect(decideClick(0, 0, 20, 0, 3)).toEqual({ type: 'ignore' });
  });

  it('a click on an actor selects it and claims the click (an actor beats the floor plate)', () => {
    expect(decideClick(10, 10, 11, 10, 2)).toEqual({ type: 'select', index: 2 });
  });

  it("t22b.3: a bay/belt/staging click's own drag gate matches isDrag's threshold", () => {
    // R3F's event.delta is already rounded (see isR3fClickDrag's own comment); 4 is still a click, 5 is a drag.
    expect(isR3fClickDrag(4)).toBe(false);
    expect(isR3fClickDrag(5)).toBe(true);
    expect(isR3fClickDrag(0)).toBe(false);
  });

  it('a click on nothing of ours passes through to the bays, belts and staging', () => {
    expect(decideClick(10, 10, 10, 10, -1)).toEqual({ type: 'passthrough' });
  });
});

describe('hover throttle', () => {
  it('lets one look through per interval, 10 Hz', () => {
    expect(HOVER_INTERVAL_MS).toBe(100);
    const gate = new HoverGate();
    const passed: number[] = [];
    // a pointer moving at 120 Hz for one second
    for (let t = 0; t < 1000; t += 1000 / 120) if (gate.ready(t, 0)) passed.push(t);
    expect(passed.length).toBeGreaterThanOrEqual(9);
    expect(passed.length).toBeLessThanOrEqual(10);
    for (let i = 1; i < passed.length; i++) {
      expect((passed[i] as number) - (passed[i - 1] as number)).toBeGreaterThanOrEqual(
        HOVER_INTERVAL_MS,
      );
    }
  });

  it('is skipped while a button is held (camera drag) and does not use up the interval', () => {
    const gate = new HoverGate();
    expect(gate.ready(0, 1)).toBe(false);
    expect(gate.ready(1, 2)).toBe(false);
    expect(gate.ready(2, 0)).toBe(true);
    expect(gate.ready(50, 0)).toBe(false);
    expect(gate.ready(102, 0)).toBe(true);
  });

  it('does not run on its own: it only answers when asked', () => {
    // no timers, no listeners: constructing a gate schedules nothing
    const gate = new HoverGate();
    expect(gate.ready(5000, 0)).toBe(true);
  });
});

describe('speed', () => {
  // follows the obstacles speed test: calls per millisecond over a short run after a warm-up, with a generous floor
  // because these machines are load-sensitive
  it('picks among the largest crowd the scene can hold, at the thousands per millisecond range', () => {
    const list = new PickList();
    // 7 bays x (10 people + 1 forklift) + 21 trucks
    for (let b = 0; b < 7; b++) {
      for (let p = 0; p < 10; p++) addPerson(list, `t-${b}-${p}`, b * 6.5 + p * 0.3, 1.2, 14 + p);
      addForklift(list, `f-${b}`, b * 6.5, 1.2, 20, 1.2);
    }
    for (let t = 0; t < 21; t++)
      addTruck(list, `V-${t}`, (t % 7) * 6.5, 0, -2, (t * Math.PI) / 3, 8.9);
    expect(list.count).toBe(98);
    const r = ray([0, 60, 90], [10, 1, 14]);
    const run = () => {
      const t0 = performance.now();
      let calls = 0;
      while (performance.now() - t0 < 40) {
        list.nearest(r);
        calls++;
      }
      return calls / (performance.now() - t0);
    };
    run();
    // a hover look is 10 per second and a click rare: even 2 per millisecond (0.5 ms) would be far inside the budget
    expect(run()).toBeGreaterThan(2);
  });
});
