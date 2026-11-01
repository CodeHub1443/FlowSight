import { describe, expect, it } from 'vitest';
import type { InterleavedBufferAttribute } from 'three';
import siteConfigJson from '../../../config/sites/dhk-depot.json';
import { SiteConfigSchema } from '@/domain/schemas';
import { DARK_PALETTE, LIGHT_PALETTE } from '../materials';
import { QUALITY } from '../quality';
import { buildSiteLayout } from '../site/layout';
import { ActorRig } from './actorRig';

const layout = buildSiteLayout(SiteConfigSchema.parse(siteConfigJson));
const buffers = (rig: ActorRig) =>
  new Set(
    rig.pools.map((p) => (p.mesh.instanceMatrix as unknown as InterleavedBufferAttribute).data),
  );

describe('ActorRig buffers', () => {
  // disposing a rig deletes the GL buffers behind its attributes; a successor on the same buffers kept drawing the deleted
  // buffers' frozen contents after a theme or tier change (half-dithered trucks, seen in the Task 14 dark overview)
  it('a new rig after a theme or tier change shares no buffer with the old one', () => {
    const light = new ActorRig(layout, LIGHT_PALETTE, QUALITY.med, false);
    const dark = new ActorRig(layout, DARK_PALETTE, QUALITY.low, false);
    expect(buffers(light).size).toBe(2);
    for (const b of buffers(dark)) expect(buffers(light).has(b)).toBe(false);
  });
});
