// @vitest-environment node
import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import siteConfigJson from '../../../config/sites/dhk-depot.json';
import { SiteConfigSchema } from '@/domain';
import { buildSiteLayout } from '../site/layout';
import { bayToSite } from '../site/transforms';
import { presetPose } from './presets';
import {
  applyViewFit,
  CAMERA_FOV,
  easeInOutCubic,
  FLY_MS,
  NO_SAFE_AREA,
  SCENE_SAFE_AREA,
  viewFit,
} from './view';

const layout = buildSiteLayout(SiteConfigSchema.parse(siteConfigJson));

/** /live canvas sizes at the two reference viewports: the 49 px top bar (h-14 at the 14 px root) sits above it. */
const CANVASES = [
  [1920, 1080 - 49],
  [1366, 768 - 49],
] as const;

/** A camera set up exactly like CameraRig does it for a canvas and a preset. */
function cameraFor(width: number, height: number, preset = 'floorOverview') {
  const fit = viewFit(width, height, SCENE_SAFE_AREA);
  const camera = new PerspectiveCamera(CAMERA_FOV, width / height, 1, 700);
  applyViewFit(camera, fit);
  const pose = presetPose(layout, preset, fit);
  if (!pose) throw new Error('no pose');
  camera.position.set(...pose.position);
  camera.lookAt(new Vector3(...pose.target));
  camera.updateMatrixWorld();
  return { camera, fit };
}

/** Canvas pixel of a bay-frame point of `bayId`. */
function project(
  camera: PerspectiveCamera,
  width: number,
  height: number,
  bayId: string,
  p: [number, number, number],
) {
  const bay = layout.bays.find((b) => b.id === bayId);
  if (!bay) throw new Error(bayId);
  const s = bayToSite(bay.face, bay.door, { x: p[0], y: p[1], z: p[2] }, layout.floorLevel);
  const v = new Vector3(s.X, s.Y, s.Z).project(camera);
  return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height };
}

describe('SCENE_SAFE_AREA', () => {
  it('is the agreed card layout (top 120, right column 360 + 24 gap, collapsed tracker 88, left 24)', () => {
    expect(SCENE_SAFE_AREA).toEqual({ top: 120, right: 384, bottom: 88, left: 24 });
    expect(Object.isFrozen(SCENE_SAFE_AREA)).toBe(true);
  });

  it('moves the optical axis to the centre of the safe rectangle, keeping the canvas fov and aspect', () => {
    const fit = viewFit(1920, 1080, SCENE_SAFE_AREA);
    expect(fit.centre).toEqual({ x: 24 + (1920 - 408) / 2, y: 120 + (1080 - 208) / 2 });
    const o = fit.offset;
    if (!o) throw new Error('expected a view offset');
    expect(o.fullWidth / o.fullHeight).toBeCloseTo(1920 / 1080, 9);
    expect(o.fullWidth / 2 - o.x).toBeCloseTo(fit.centre.x, 9);
    expect(o.fullHeight / 2 - o.y).toBeCloseTo(fit.centre.y, 9);
    expect(o.x).toBeGreaterThanOrEqual(0);
    expect(o.x + o.width).toBeLessThanOrEqual(o.fullWidth + 1e-9);
    // the canvas itself still shows CAMERA_FOV vertically
    const k = o.fullHeight / 1080;
    expect(Math.tan((fit.fov * Math.PI) / 360) / k).toBeCloseTo(
      Math.tan((CAMERA_FOV * Math.PI) / 360),
      9,
    );
  });

  it('projects the camera target onto the safe-rectangle centre (applied through setViewOffset)', () => {
    for (const [w, h] of CANVASES) {
      const { camera, fit } = cameraFor(w, h);
      expect(camera.view?.enabled).toBe(true);
      const pose = presetPose(layout, 'floorOverview', fit);
      if (!pose) throw new Error('no pose');
      const v = new Vector3(...pose.target).project(camera);
      expect(((v.x + 1) / 2) * w).toBeCloseTo(fit.centre.x, 3);
      expect(((1 - v.y) / 2) * h).toBeCloseTo(fit.centre.y, 3);
    }
  });

  for (const preset of ['floorOverview', 'plan']) {
    it(`keeps every bay, B01 and B07 included, clear of the cards in ${preset} at 1920x1080 and 1366x768`, () => {
      for (const [w, h] of CANVASES) {
        const { camera, fit } = cameraFor(w, h, preset);
        const { top, right, bottom, left } = fit.insets;
        for (const bay of layout.bays) {
          const half = bay.pitch / 2 - 0.2;
          // eave top corners, belt tip, staging far corners
          for (const p of [
            [-half, 0, 5.2],
            [half, 0, 5.2],
            [0, 0.5, 0.8],
            [-half, 16, 0],
            [half, 16, 0],
          ] as [number, number, number][]) {
            const px = project(camera, w, h, bay.id, p);
            expect(px.x, `${bay.id} ${p.join(',')} @ ${w}`).toBeGreaterThanOrEqual(left);
            expect(px.x, `${bay.id} ${p.join(',')} @ ${w}`).toBeLessThanOrEqual(w - right);
            expect(px.y, `${bay.id} ${p.join(',')} @ ${w}`).toBeGreaterThanOrEqual(top);
            expect(px.y, `${bay.id} ${p.join(',')} @ ${w}`).toBeLessThanOrEqual(h - bottom);
          }
        }
      }
    });
  }

  it('recedes along the diagonal in the hero view: B07 nearest on the left, B01 furthest on the right', () => {
    for (const [w, h] of CANVASES) {
      const { camera } = cameraFor(w, h);
      const px = layout.bays.map((b) => project(camera, w, h, b.id, [0, 0, 5.2]));
      for (let i = 1; i < px.length; i++) {
        const [east = { x: 0, y: 0 }, west = { x: 0, y: 0 }] = [px[i], px[i - 1]];
        expect(east.x, `step ${i} @ ${w}`).toBeLessThan(west.x);
        expect(east.y, `step ${i} @ ${w}`).toBeGreaterThan(west.y);
      }
    }
  });

  it('frames the dock wall at the top of the safe area in Plan and leaves the far floor out of frame', () => {
    for (const [w, h] of CANVASES) {
      const { camera, fit } = cameraFor(w, h, 'plan');
      const { top, bottom } = fit.insets;
      const safeH = h - top - bottom;
      for (const bay of layout.bays) {
        // no empty band: the top of the door band is within 6 % of the safe top
        const wall = project(camera, w, h, bay.id, [0, 0, 5.2]);
        expect(wall.y - top, `${bay.id} wall @ ${w}`).toBeLessThanOrEqual(0.06 * safeH);
        // staging fills the lower half; the floor 12 m behind the aisle is out of frame
        expect(
          project(camera, w, h, bay.id, [0, 16, 0]).y,
          `${bay.id} staging @ ${w}`,
        ).toBeGreaterThan(top + safeH / 2);
        expect(
          project(camera, w, h, bay.id, [0, 28, 0]).y,
          `${bay.id} storage @ ${w}`,
        ).toBeGreaterThan(h - bottom);
      }
    }
  });

  it('shrinks the insets on small canvases and needs no offset without a safe area', () => {
    const small = viewFit(500, 300, SCENE_SAFE_AREA);
    expect(small.insets.left + small.insets.right).toBeCloseTo(500 * 0.6, 6);
    expect(viewFit(800, 600, NO_SAFE_AREA).offset).toBeNull();
    expect(viewFit(800, 600, NO_SAFE_AREA).fov).toBeCloseTo(CAMERA_FOV, 9);
  });
});

describe('fly-to motion (docs/06 section 2)', () => {
  it('lasts 700 to 900 ms with easeInOutCubic', () => {
    expect(FLY_MS).toBeGreaterThanOrEqual(700);
    expect(FLY_MS).toBeLessThanOrEqual(900);
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 9);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.25)).toBeCloseTo(0.0625, 9);
  });
});
