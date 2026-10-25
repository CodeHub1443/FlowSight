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
  presetPose,
} from './presets';

const layout = buildSiteLayout(SiteConfigSchema.parse(siteConfigJson));
const dist = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - (b[i] ?? 0)));

describe('camera presets', () => {
  for (const aspect of [16 / 9, 4 / 3]) {
    for (const preset of [...SCENE_PRESETS, 'B04']) {
      it(`${preset} @ ${aspect.toFixed(2)} stays inside the orbit limits`, () => {
        const pose = presetPose(layout, preset, aspect);
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

  it('looks south from the north half of the shed by default (docs/04 section 1)', () => {
    const pose = presetPose(layout, 'floorOverview', 16 / 9);
    expect(pose).toBeDefined();
    if (!pose) return;
    expect(pose.position[2]).toBeLessThan(pose.target[2] - 20);
    expect(pose.position[1] - pose.target[1]).toBeGreaterThan(30);
    expect(Math.abs(pose.position[0] - pose.target[0])).toBeLessThan(10);
  });

  it('centres a bay preset on that bay and rejects unknown bays', () => {
    expect(presetPose(layout, 'B02', 16 / 9)?.target[0]).toBeCloseTo(-13, 6);
    expect(presetPose(layout, 'B99', 16 / 9)).toBeUndefined();
  });
});
