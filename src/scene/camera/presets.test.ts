// @vitest-environment node
import { describe, expect, it } from 'vitest';
import siteConfigJson from '../../../config/sites/dhk-depot.json';
import { SiteConfigSchema } from '@/domain';
import { buildSiteLayout } from '../site/layout';
import {
  MAX_DISTANCE,
  MAX_POLAR,
  MIN_DISTANCE,
  MIN_POLAR,
  SCENE_PRESETS,
  plainFit,
  presetPose,
} from './presets';
import { SCENE_SAFE_AREA, viewFit } from './view';

const layout = buildSiteLayout(SiteConfigSchema.parse(siteConfigJson));
const dist = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - (b[i] ?? 0)));

const FITS = {
  '16:9': plainFit(16 / 9),
  '4:3': plainFit(4 / 3),
  '1920x1080 safe': viewFit(1920, 1080, SCENE_SAFE_AREA),
  '1366x768 safe': viewFit(1366, 768, SCENE_SAFE_AREA),
};

describe('camera presets', () => {
  for (const [name, fit] of Object.entries(FITS)) {
    for (const preset of [...SCENE_PRESETS, 'B01', 'B04', 'B07']) {
      it(`${preset} @ ${name} stays inside the orbit limits`, () => {
        const pose = presetPose(layout, preset, fit);
        expect(pose).toBeDefined();
        if (!pose) return;
        const d = dist(pose.position, pose.target);
        expect(d).toBeGreaterThanOrEqual(MIN_DISTANCE);
        expect(d).toBeLessThanOrEqual(MAX_DISTANCE);
        const polar = Math.acos((pose.position[1] - pose.target[1]) / d);
        expect(polar).toBeGreaterThanOrEqual(MIN_POLAR - 1e-6);
        expect(polar).toBeLessThanOrEqual(MAX_POLAR + 1e-6);
      });
    }
  }

  it('keeps the straight-on view from the north as preset Plan (docs/06 D1)', () => {
    const pose = presetPose(layout, 'plan', FITS['1920x1080 safe']);
    expect(pose).toBeDefined();
    if (!pose) return;
    expect(pose.position[2]).toBeLessThan(pose.target[2] - 20);
    expect(pose.position[1] - pose.target[1]).toBeGreaterThan(30);
    expect(Math.abs(pose.position[0] - pose.target[0])).toBeLessThan(10);
  });

  for (const [name, fit] of Object.entries(FITS)) {
    it(`defaults to the diagonal hero view: elevation 36-42, azimuth 30-40, from the north-east @ ${name} (docs/06 D1)`, () => {
      const pose = presetPose(layout, 'floorOverview', fit);
      if (!pose) throw new Error('no pose');
      const dx = pose.position[0] - pose.target[0];
      const dy = pose.position[1] - pose.target[1];
      const dz = pose.position[2] - pose.target[2];
      const elevation = (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
      // azimuth off the dock-wall normal, which points north (-Z) into the shed
      const azimuth = (Math.atan2(dx, -dz) * 180) / Math.PI;
      expect(elevation).toBeGreaterThanOrEqual(36);
      expect(elevation).toBeLessThanOrEqual(42);
      expect(azimuth).toBeGreaterThanOrEqual(30);
      expect(azimuth).toBeLessThanOrEqual(40);
    });
  }

  it('centres a bay preset on that bay and rejects unknown bays', () => {
    expect(presetPose(layout, 'B02', FITS['16:9'])?.target[0]).toBeCloseTo(-13, 6);
    expect(presetPose(layout, 'B99', FITS['16:9'])).toBeUndefined();
  });

  it('frames from further away when the safe area is smaller', () => {
    const plain = presetPose(layout, 'floorOverview', plainFit(1366 / 768));
    const safe = presetPose(layout, 'floorOverview', FITS['1366x768 safe']);
    if (!plain || !safe) throw new Error('no pose');
    expect(dist(safe.position, safe.target)).toBeGreaterThan(dist(plain.position, plain.target));
  });
});
