import { createContext, useContext } from 'react';

export type FillName =
  'top' | 'left' | 'right' | 'body' | 'white' | 'whiteSide' | 'whiteDeep' | 'dark';

export const IdContext = createContext('');

/** `url(#...)` of one of the frame's gradients. */
export function useFill(): (name: FillName | 'shadow') => string {
  const id = useContext(IdContext);
  return (name) => `url(#${id}-${name})`;
}

export type Pt = readonly [number, number];

/** Isometric projection: `u` runs to the lower right, `v` to the lower left, `w` up. */
export function iso(ox: number, oy: number) {
  return (u: number, v: number, w: number): Pt => [ox + (u - v) * 0.866, oy + (u + v) * 0.5 - w];
}
