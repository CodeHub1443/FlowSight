// Whether a truck's rear plate can be seen from the camera. The plate is a DOM element over the canvas (Bangla needs the
// browser's text shaping, docs/04 section 4), so nothing in the scene can hide it: these are the two cases that matter,
// the plate turned away and the dock wall in between. Pure; all heights are world heights, x and y are the face frame.

export const MIN_PLATE_PX = 42;

export interface WallView {
  doors: readonly number[];
  doorWidth: number;
  /** Top of a door opening and of the wall, world heights. */
  doorTop: number;
  wallTop: number;
}

/** Does the straight line from camera to plate cross the dock wall through a door or above the wall? */
export function clearOfWall(
  camera: { x: number; y: number; h: number },
  plate: { x: number; y: number; h: number },
  wall: WallView,
): boolean {
  if (camera.y <= 0 || plate.y >= 0) return true;
  const k = camera.y / (camera.y - plate.y);
  const x = camera.x + (plate.x - camera.x) * k;
  const h = camera.h + (plate.h - camera.h) * k;
  if (h >= wall.wallTop) return true;
  return h < wall.doorTop && wall.doors.some((d) => Math.abs(x - d) < wall.doorWidth / 2);
}

/** A plate in two lines, as painted on a real one: district and series, then the number. */
export function plateLines(bn: string): [string, string] {
  const at = bn.lastIndexOf(' ');
  return at < 0 ? [bn, ''] : [bn.slice(0, at), bn.slice(at + 1)];
}

/** `facing` = dot of the plate's outward normal and the direction to the camera. */
export function plateShown(facing: number, widthPx: number, clear: boolean): boolean {
  return facing > 0.05 && widthPx >= MIN_PLATE_PX && clear;
}
