// Bay/face frame -> three.js child coordinates: x stays, bay z (up) -> three Y, bay y (into the building) -> three -Z.
export type V3 = readonly [number, number, number];
export const bayToThree = (v: V3): [number, number, number] => [v[0], v[2], -v[1]];
