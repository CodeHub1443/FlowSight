import { ShaderChunk } from 'three';

// docs/06 section 2 wants a soft key-light shadow (radius >= 6). three r186's PCF filter takes only 5 Vogel-disk taps
// rotated by per-pixel noise, which at radius 6 shows as visible grain on the pale floor. This raises the tap count
// of the 2D PCF filter (directional and spot lights; High tier only; Med and Low cast no shadows). Applied once when the scene chunk loads;
// softShadows.test.ts fails if a three.js upgrade changes the chunk so the patch no longer applies.

export const SOFT_SHADOW_TAPS = 16;

const FIVE_TAPS =
  /shadow = \(\s*texture\( shadowMap, vec3\( shadowCoord\.xy \+ vogelDiskSample\( 0, 5, phi \) \* radius, shadowCoord\.z \) \) \+[\s\S]*?\) \* 0\.2;/g;

const MANY_TAPS = `shadow = 0.0;
				for ( int i = 0; i < ${SOFT_SHADOW_TAPS}; i ++ ) {
					shadow += texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( i, ${SOFT_SHADOW_TAPS}, phi ) * radius, shadowCoord.z ) );
				}
				shadow /= ${SOFT_SHADOW_TAPS}.0;`;

/** The patched chunk source, or null when the r186 five-tap block is not found. */
export function softenShadowChunk(source: string): string | null {
  return source.match(FIVE_TAPS) ? source.replace(FIVE_TAPS, MANY_TAPS) : null;
}

let applied = false;

/** Patch three's shared shadow chunk once; returns whether the patch is active. */
export function applySoftShadows(): boolean {
  if (applied) return true;
  const patched = softenShadowChunk(ShaderChunk.shadowmap_pars_fragment);
  if (patched === null) return false;
  ShaderChunk.shadowmap_pars_fragment = patched;
  applied = true;
  return true;
}
