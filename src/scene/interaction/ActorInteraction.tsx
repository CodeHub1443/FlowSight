import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import {
  type BufferGeometry,
  type Group,
  type Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector2,
  Vector3,
} from 'three';
import type { BayMaps } from '../actors/actorRig';
import type { ActorFeed } from '../actors/feed';
import { ACTOR_LAYER } from '../actors/pool';
import type { World } from '../actors/world';
import type { GlyphBoard } from '../glyphs/cameraGlyph';
import { ACTOR_KEY, type PillElements } from '../labels/Pills';
import {
  forkliftLabel,
  personLabel,
  truckLabel,
  type ActorLabelStrings,
} from '../labels/actorLabel';
import { useSceneEnv } from '../sceneEnv';
import type { SiteLayout } from '../site/layout';
import { roundedRing } from '../shapes';
import { QUALITY_DEBUG } from '../qualityProbe';
import { fillPicks } from './fill';
import { decideClick, HoverGate, isDrag, PickList, type Ray } from './pick';
import { pickProbe, type PickPoint } from './pickProbe';
import { newWorldPose, trackWorldPose, truckWorldPose, type WorldPose } from './poses';
import type { ActorSelection, SceneSelection } from './types';

// The one canvas-level pointer handler for trucks, people, forklifts and camera glyphs (t22 spec B1). They are instances in
// shared pools, so there is nothing for R3F to raycast: on a click, a ray is tested against the bounds of what is drawn
// now (pick.ts). A click that hits claims the event, so the bay under the actor is not selected as well; a drag, or a
// click on nothing of ours, reaches R3F and the bays as before. Hover looks only while the pointer moves, 10 times a second
// at most, and never during a camera drag. The selected actor gets a floor ring and a pill that follow it (B2); the hovered
// one a lighter ring. All of it runs in event handlers and one useFrame: no React state.

/** Footprint of each kind as a rounded ring (outer width, depth, corner radius) and where its middle is (local z). */
const FOOTPRINT = {
  person: { w: 1.5, d: 1.5, r: 0.75, z: 0 },
  forklift: { w: 1.9, d: 3.9, r: 0.5, z: -0.3 },
  truck: { w: 3.1, d: 9.8, r: 0.6, z: -4.45 },
} as const;
/** Height of the pill's anchor above the floor, per kind, metres. */
const PILL_HEIGHT = { person: 2.2, forklift: 3.0, truck: 5.4 } as const;
const HOVER_LINE = 0.1;
const SELECT_LINE = 0.18;
const RING_LIFT = 0.05;

type Kind = ActorSelection['kind'];
const ring = (kind: Kind, line: number): BufferGeometry => {
  const f = FOOTPRINT[kind];
  return roundedRing(f.w, f.d, f.r, line);
};

const ndc = new Vector2();
const _v = new Vector3();
const ray: Ray = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 1 };

interface MarkerProps {
  material: MeshBasicMaterial;
  line: number;
  groupRef: RefObject<Group | null>;
}

function Marker({ material, line, groupRef }: MarkerProps) {
  return (
    <group ref={groupRef} visible={false}>
      <mesh
        geometry={ring('person', line)}
        material={material}
        renderOrder={5}
        onUpdate={(m) => m.layers.set(ACTOR_LAYER)}
      />
    </group>
  );
}

interface Props {
  layout: SiteLayout;
  world: World;
  maps: BayMaps;
  feed: ActorFeed;
  board: GlyphBoard | null;
  /** The selected truck, person or forklift (none for bays, events, nothing). */
  selected: ActorSelection | null;
  onSelect?: (selection: SceneSelection) => void;
  pills: RefObject<PillElements>;
  strings: ActorLabelStrings;
}

export function ActorInteraction({
  layout,
  world,
  maps,
  feed,
  board,
  selected,
  onSelect,
  pills,
  strings,
}: Props) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const { palette } = useSceneEnv();

  const list = useMemo(() => new PickList(), []);
  const raycaster = useMemo(() => new Raycaster(), []);
  const hover = useRef<ActorSelection | null>(null);
  const live = useRef({ selected, onSelect, strings, board });
  useLayoutEffect(() => {
    live.current = { selected, onSelect, strings, board };
  });

  const hoverMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        color: palette.hover,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    [palette.hover],
  );
  const selectMaterial = useMemo(
    () => new MeshBasicMaterial({ color: palette.brand, transparent: true, depthWrite: false }),
    [palette.brand],
  );
  useEffect(
    () => () => {
      hoverMaterial.dispose();
      selectMaterial.dispose();
    },
    [hoverMaterial, selectMaterial],
  );
  const hoverGroup = useRef<Group>(null);
  const selectGroup = useRef<Group>(null);

  // ---- pointer ----------------------------------------------------------------------------------------------------
  useEffect(() => {
    const el = gl.domElement;
    const gate = new HoverGate();
    let down: { x: number; y: number } | null = null;

    const pickAt = (clientX: number, clientY: number): number => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return -1;
      ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const r = raycaster.ray;
      ray.ox = r.origin.x;
      ray.oy = r.origin.y;
      ray.oz = r.origin.z;
      ray.dx = r.direction.x;
      ray.dy = r.direction.y;
      ray.dz = r.direction.z;
      fillPicks(list, world, layout, maps, live.current.board);
      return list.nearest(ray);
    };

    const onDown = (e: PointerEvent) => {
      down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
      // a drag starts: nothing is hovered while the camera moves
      hover.current = null;
      el.style.cursor = '';
    };
    const onClick = (e: MouseEvent) => {
      const start = down;
      down = null;
      if (!start || e.button !== 0) return;
      if (isDrag(start.x, start.y, e.clientX, e.clientY)) return;
      const hit = pickAt(e.clientX, e.clientY);
      const decision = decideClick(start.x, start.y, e.clientX, e.clientY, hit);
      if (decision.type !== 'select') return;
      // an actor beats the bay floor plate under it: the click does not reach R3F's bay handler
      e.stopPropagation();
      const kind = list.kinds[decision.index];
      const id = list.ids[decision.index];
      if (!kind || id === undefined) return;
      live.current.onSelect?.(kind === 'camera' ? { kind, camId: id } : { kind, id });
    };
    const onMove = (e: PointerEvent) => {
      if (!gate.ready(e.timeStamp, e.buttons)) return;
      const t0 = QUALITY_DEBUG ? performance.now() : 0;
      const hit = pickAt(e.clientX, e.clientY);
      if (QUALITY_DEBUG) {
        pickProbe.hoverLooks++;
        pickProbe.hoverMs += performance.now() - t0;
      }
      const kind = hit >= 0 ? list.kinds[hit] : undefined;
      const id = hit >= 0 ? list.ids[hit] : undefined;
      el.style.cursor = kind ? 'pointer' : '';
      hover.current = kind && kind !== 'camera' && id !== undefined ? { kind, id } : null;
    };
    const onLeave = () => {
      hover.current = null;
      el.style.cursor = '';
    };

    if (QUALITY_DEBUG) {
      const c: [number, number, number] = [0, 0, 0];
      pickProbe.points = () => {
        const rect = el.getBoundingClientRect();
        fillPicks(list, world, layout, maps, live.current.board);
        const out: PickPoint[] = [];
        for (let i = 0; i < list.count; i++) {
          list.center(i, c);
          const v = _v.set(c[0], c[1], c[2]).project(camera);
          if (v.z <= -1 || v.z >= 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
          out.push({
            kind: list.kinds[i] ?? 'person',
            id: list.ids[i] ?? '',
            x: rect.left + ((v.x + 1) / 2) * rect.width,
            y: rect.top + ((1 - v.y) / 2) * rect.height,
          });
        }
        return out;
      };
      pickProbe.hovered = () => hover.current;
    }
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('click', onClick);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('click', onClick);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.style.cursor = '';
      hover.current = null;
      if (QUALITY_DEBUG) {
        pickProbe.points = () => [];
        pickProbe.hovered = () => null;
      }
    };
  }, [gl, camera, raycaster, list, world, layout, maps]);

  // ---- markers and the pill, per frame, from refs ----------------------------------------------------------------------
  const selPose = useMemo(() => newWorldPose(), []);
  const hoverPose = useMemo(() => newWorldPose(), []);
  const pill = useRef<{ key: string; source: unknown; strings: unknown }>({
    key: '',
    source: undefined,
    strings: undefined,
  });

  /** The pose of an actor by id; null when it is gone. */
  const find = (a: ActorSelection, out: WorldPose): boolean => {
    if (a.kind === 'truck') {
      const t = world.trucks.trucks.get(a.id);
      return t !== undefined && truckWorldPose(layout.floorLevel, maps, t, out);
    }
    const t = world.tracks.tracks.get(a.id);
    return t !== undefined && trackWorldPose(layout.floorLevel, maps, t, out);
  };

  const place = (
    group: Group | null,
    a: ActorSelection | null,
    line: number,
    pose: WorldPose,
  ): boolean => {
    if (!group) return false;
    if (!a || !find(a, pose)) {
      group.visible = false;
      return false;
    }
    const mesh = group.children[0] as Mesh | undefined;
    if (!mesh) return false;
    const f = FOOTPRINT[a.kind];
    const key = `${a.kind}|${line}`;
    if (mesh.userData.key !== key) {
      mesh.userData.key = key;
      mesh.geometry = ring(a.kind, line);
      mesh.position.set(0, RING_LIFT, f.z);
    }
    group.position.set(pose.X, pose.Y, pose.Z);
    group.rotation.y = pose.rotY;
    group.visible = pose.fade > 0.05;
    return true;
  };

  useFrame(() => {
    const { selected: sel, strings: words } = live.current;
    const shown = place(selectGroup.current, sel, SELECT_LINE, selPose);
    const h = hover.current;
    const same = h && sel && h.kind === sel.kind && h.id === sel.id;
    place(hoverGroup.current, same ? null : h, HOVER_LINE, hoverPose);

    const wrap = pills.current.get(ACTOR_KEY);
    if (!wrap) return;
    if (!sel || !shown) {
      if (wrap.style.visibility !== 'hidden') wrap.style.visibility = 'hidden';
      pill.current.key = '';
      return;
    }
    // text: rebuilt when the selection, the language or what the label reads changes
    const text = wrap.querySelector<HTMLElement>('[data-actor-pill-text]');
    let source: unknown;
    if (sel.kind === 'truck') source = feed.getBay(world.trucks.trucks.get(sel.id)?.bay ?? '');
    else source = world.tracks.tracks.get(sel.id)?.actor;
    const key = `${sel.kind}|${sel.id}`;
    const p = pill.current;
    if (text && (p.key !== key || p.strings !== words || p.source !== source)) {
      p.key = key;
      p.strings = words;
      p.source = source;
      if (sel.kind === 'truck') {
        const t = world.trucks.trucks.get(sel.id);
        const bay = feed.getBay(t?.bay ?? '');
        const visit = bay?.visit && bay.visit.visitId === sel.id ? bay.visit : null;
        text.textContent = t ? truckLabel(t.bay, t.plate, visit, words) : '';
      } else {
        const t = world.tracks.tracks.get(sel.id);
        text.textContent = !t
          ? ''
          : sel.kind === 'forklift'
            ? forkliftLabel(t.bay, words)
            : personLabel(t.actor.role, words);
      }
    }
    const v = _v.set(selPose.X, selPose.Y + PILL_HEIGHT[sel.kind], selPose.Z).project(camera);
    const on = v.z > -1 && v.z < 1;
    const x = ((v.x + 1) / 2) * size.width;
    const y = ((1 - v.y) / 2) * size.height;
    const tf = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    if (wrap.dataset.t !== tf) {
      wrap.style.transform = tf;
      wrap.dataset.t = tf;
    }
    const vis = on ? 'visible' : 'hidden';
    if (wrap.style.visibility !== vis) wrap.style.visibility = vis;
  });

  return (
    <>
      <Marker material={hoverMaterial} line={HOVER_LINE} groupRef={hoverGroup} />
      <Marker material={selectMaterial} line={SELECT_LINE} groupRef={selectGroup} />
    </>
  );
}
