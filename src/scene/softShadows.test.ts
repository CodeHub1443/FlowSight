// @vitest-environment node
import { ShaderChunk } from 'three';
import { describe, expect, it } from 'vitest';
import { SOFT_SHADOW_TAPS, softenShadowChunk } from './softShadows';

describe('soft PCF shadows', () => {
  it('finds the five-tap PCF block of the installed three.js and replaces it', () => {
    const patched = softenShadowChunk(ShaderChunk.shadowmap_pars_fragment);
    expect(patched).not.toBeNull();
    expect(patched).toContain(`vogelDiskSample( i, ${SOFT_SHADOW_TAPS}, phi )`);
    // the 2D (directional/spot) block; the point-light cube variant is untouched and unused
    expect(patched).not.toContain('vogelDiskSample( 0, 5, phi ) * radius');
  });

  it('leaves unknown shader source alone', () => {
    expect(softenShadowChunk('void main() {}')).toBeNull();
  });
});
