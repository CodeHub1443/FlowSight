import { Vector2 } from 'three';

/** Height of the event pin, tip to crown (docs/06 D9). */
export const PIN_HEIGHT = 1.2;
export const HEAD_RADIUS = PIN_HEIGHT * 0.33;

/** The teardrop outline, tip at y = 0 and crown at y = PIN_HEIGHT: a circular head tapering into a straight cone. */
export function teardropProfile(segments: number): Vector2[] {
  const cy = PIN_HEIGHT - HEAD_RADIUS;
  // where the cone meets the head tangentially
  const tangent = Math.asin(HEAD_RADIUS / cy);
  const out: Vector2[] = [new Vector2(0, 0)];
  for (let i = 0; i <= segments; i++) {
    const a = -tangent + (i / segments) * (Math.PI / 2 + tangent);
    out.push(new Vector2(HEAD_RADIUS * Math.cos(a), cy + HEAD_RADIUS * Math.sin(a)));
  }
  out[out.length - 1]?.setX(0);
  return out;
}
