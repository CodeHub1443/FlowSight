// docs/04 section 2.1: bay-local frame <-> site frame (= three.js world).
//   site:  X east, Y up, Z south, origin = shed footprint centre at yard grade (Y = 0).
//   bay:   x right when facing the door from the yard, y into the building, z up,
//          origin = door centre at dock floor level (building.floorLevel above yard grade).

export type Face = 'N' | 'S' | 'E' | 'W';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
/** Site / three.js coordinates. */
export interface SitePoint {
  X: number;
  Y: number;
  Z: number;
}
/** Door centre on the shed footprint edge, horizontal site coordinates. */
export interface DoorOrigin {
  X: number;
  Z: number;
}

/**
 * Rotation.y that turns the bay frame (+y into the building) onto the site frame.
 *
 * docs/04 section 2.1 lists E = -pi/2 and W = +pi/2, which contradicts its own position formulas
 * (E: X = Xd - y, Z = Zd - x; W: X = Xd + y, Z = Zd + x). three.js rotation.y = t maps a local
 * (a, c) to X = a cos t + c sin t, Z = -a sin t + c cos t, so with those formulas E needs +pi/2 and W
 * needs -pi/2. The position formulas are authoritative (they follow from the contract frame); the
 * yaw is derived from them and verified against them in transforms.test.ts.
 */
export function faceYaw(face: Face): number {
  switch (face) {
    case 'S':
      return 0;
    case 'N':
      return Math.PI;
    case 'E':
      return Math.PI / 2;
    case 'W':
      return -Math.PI / 2;
  }
}

/** Contract heading h (0 = +y, CCW positive seen from above) -> three.js rotation.y (positive = CCW from above) of an object modelled facing bay +y. */
export function headingToRotationY(face: Face, h: number): number {
  return faceYaw(face) + h;
}

/** Horizontal part of the bay -> site mapping (docs/04 section 2.1). */
function horizontal(face: Face, d: DoorOrigin, x: number, y: number): { X: number; Z: number } {
  switch (face) {
    case 'S':
      return { X: d.X + x, Z: d.Z - y };
    case 'N':
      return { X: d.X - x, Z: d.Z + y };
    case 'E':
      return { X: d.X - y, Z: d.Z - x };
    case 'W':
      return { X: d.X + y, Z: d.Z + x };
  }
}

/**
 * Bay-local -> site. Inside (y >= 0) z is above the dock floor (`floorLevel`); outside (y < 0) things sit at
 * yard grade, so z is above Y = 0 (docs/04 section 2.1: "actors with y < 0 are placed at yard grade").
 */
export function bayToSite(face: Face, door: DoorOrigin, p: Vec3, floorLevel: number): SitePoint {
  const { X, Z } = horizontal(face, door, p.x, p.y);
  return { X, Y: (p.y < 0 ? 0 : floorLevel) + p.z, Z };
}

/** Exact inverse of {@link bayToSite}. */
export function siteToBay(face: Face, door: DoorOrigin, s: SitePoint, floorLevel: number): Vec3 {
  const dX = s.X - door.X;
  const dZ = s.Z - door.Z;
  let x: number;
  let y: number;
  switch (face) {
    case 'S':
      x = dX;
      y = -dZ;
      break;
    case 'N':
      x = -dX;
      y = dZ;
      break;
    case 'E':
      x = -dZ;
      y = -dX;
      break;
    case 'W':
      x = dZ;
      y = dX;
      break;
  }
  return { x, y, z: s.Y - (y < 0 ? 0 : floorLevel) };
}
