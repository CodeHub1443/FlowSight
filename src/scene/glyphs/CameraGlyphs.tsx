import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  Color,
  type InstancedBufferAttribute,
  type InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { ACTOR_LAYER } from '../actors/pool';
import type { ActorFeed, CamStatus } from '../actors/feed';
import { BOX_MATERIAL, unitBox } from '../geometry';
import { useInstanceGeometry } from '../instancing';
import { emissiveOf, finishOf, type PaletteKey } from '../materials';
import { useSceneEnv } from '../sceneEnv';
import type { BayLayout, CameraMount, SiteLayout } from '../site/layout';
import { headingToRotationY } from '../site/transforms';
import { lookDirection, pulseScale, type GlyphBoard, type GlyphTint } from './cameraGlyph';

// The camera glyphs of docs/04 section 5: one small camera at each config mount, as one InstancedMesh for the whole site
// (a body and a lens per camera). Which are shown and in what tint is the GlyphBoard's (health and X-ray, updated on a
// message or a toggle, never per frame); the only per-frame work is the slow pulse of an offline camera, and none under
// prefers-reduced-motion. The mesh lives on the actor layer, so the baked contact shadows never carry it.

const BODY = [0.8, 0.55, 1.0] as const;
const LENS = { size: [0.42, 0.42, 0.3], at: 0.6 } as const;
/** How far a camera that looks along the floor is tipped down, as a share of its horizontal look. */
const TIP_DOWN = 0.45;
const TINT_TONE: Record<GlyphTint, PaletteKey> = {
  neutral: 'ink600',
  warn: 'statusWarn',
  critical: 'statusCritical',
};

interface Glyph {
  cam: CameraMount;
  /** Instance index of the body; the lens is the next. */
  index: number;
  /** Orientation: lens along local +Z, turned onto the bay's look direction. */
  quat: Quaternion;
}

const _m = new Matrix4();
const _v = new Vector3();
const _s = new Vector3();
const _o = new Vector3();
const _c = new Color();
const Z = new Vector3(0, 0, 1);

function orientation(bay: BayLayout, looks: string): Quaternion {
  // bay frame (x, y into the building, z up) -> three local (x, z, -y), then the bay's yaw about the vertical
  const [x, y, z] = lookDirection(looks);
  const local = new Vector3(x, z, -y);
  if (z === 0) local.y -= TIP_DOWN;
  local.normalize();
  const q = new Quaternion().setFromUnitVectors(Z, local);
  const yaw = new Quaternion().setFromAxisAngle(
    new Vector3(0, 1, 0),
    headingToRotationY(bay.face, 0),
  );
  return yaw.multiply(q);
}

function CameraGlyphMesh({ layout, board }: { layout: SiteLayout; board: GlyphBoard }) {
  const { palette, theme, quality } = useSceneEnv();
  const ref = useRef<InstancedMesh>(null);
  const glyphs = useMemo<Glyph[]>(() => {
    const out: Glyph[] = [];
    for (const bay of layout.bays) {
      for (const cam of bay.cameras) {
        out.push({ cam, index: out.length * 2, quat: orientation(bay, cam.looks) });
      }
    }
    return out;
  }, [layout]);
  const count = glyphs.length * 2;
  const geometry = useInstanceGeometry(unitBox(quality.smoothness.lo), count);
  const seen = useRef(-1);
  const reduced = useRef(false);

  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduced.current = q.matches;
    const on = (e: MediaQueryListEvent) => {
      reduced.current = e.matches;
      seen.current = -1;
    };
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);

  const write = (seconds: number, only?: boolean) => {
    const mesh = ref.current;
    if (!mesh) return;
    for (const g of glyphs) {
      const st = board.states.get(g.cam.id);
      if (only && !st?.pulse) continue;
      const k = st?.visible ? (st.pulse ? pulseScale(seconds, reduced.current) : 1) : 1e-5;
      const at = g.cam.at;
      _m.compose(_v.set(at.X, at.Y, at.Z), g.quat, _s.set(BODY[0] * k, BODY[1] * k, BODY[2] * k));
      mesh.setMatrixAt(g.index, _m);
      // the lens stands in front of the body, along the look direction
      _o.set(0, 0, LENS.at * k).applyQuaternion(g.quat);
      _m.compose(
        _v.set(at.X + _o.x, at.Y + _o.y, at.Z + _o.z),
        g.quat,
        _s.set(LENS.size[0] * k, LENS.size[1] * k, LENS.size[2] * k),
      );
      mesh.setMatrixAt(g.index + 1, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  const paint = () => {
    const mesh = ref.current;
    if (!mesh) return;
    const finish = geometry.getAttribute('instanceFinish') as InstancedBufferAttribute;
    for (const g of glyphs) {
      const tint = board.states.get(g.cam.id)?.tint ?? 'neutral';
      const body = TINT_TONE[tint];
      const f = finishOf(body);
      mesh.setColorAt(g.index, _c.set(palette[body]));
      finish.setXYZW(g.index, f.roughness, f.metalness, 0.25, emissiveOf(body, theme));
      const lens = finishOf('belt');
      mesh.setColorAt(g.index + 1, _c.set(palette.belt));
      finish.setXYZW(g.index + 1, lens.roughness, lens.metalness, 0.4, 0);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    finish.needsUpdate = true;
  };

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.layers.set(ACTOR_LAYER);
    mesh.frustumCulled = false;
    seen.current = -1;
  }, [geometry]);

  useFrame(({ clock }) => {
    if (seen.current !== board.version) {
      seen.current = board.version;
      paint();
      write(clock.elapsedTime);
    } else if (!reduced.current) {
      // only offline glyphs move, slowly; nothing else is rewritten
      let pulsing = false;
      for (const st of board.states.values()) pulsing ||= st.pulse && st.visible;
      if (pulsing) write(clock.elapsedTime, true);
    }
  });

  return <instancedMesh ref={ref} args={[geometry, BOX_MATERIAL, count]} />;
}

/** The camera glyphs of every bay. Keeps `board` in step with the camera health and the X-ray switch. */
export function CameraGlyphs({
  layout,
  board,
  feed,
  xray,
}: {
  layout: SiteLayout;
  board: GlyphBoard;
  feed: ActorFeed;
  xray: boolean;
}) {
  const ids = useMemo(() => layout.bays.flatMap((b) => b.cameras.map((c) => c.id)), [layout]);
  const xrayRef = useRef(xray);
  useEffect(() => {
    xrayRef.current = xray;
    const status = (cams: readonly CamStatus[] | undefined) => {
      const by = new Map(cams?.map((c) => [c.cam, c.status]));
      board.update(ids, (id) => by.get(id), xrayRef.current);
    };
    status(feed.getCams?.());
    return feed.subscribeCams?.(status);
  }, [feed, board, ids, xray]);
  return <CameraGlyphMesh layout={layout} board={board} />;
}
