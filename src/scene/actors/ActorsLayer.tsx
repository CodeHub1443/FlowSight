import { useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { Matrix4, Vector3 } from 'three';
import { ModelBoundary } from '../assets/GlbOrProcedural';
import { useModel } from '../assets/loader';
import { BAND_HEIGHT } from '../building/bandHeight';
import { QUALITY_DEBUG } from '../qualityProbe';
import { useSceneEnv } from '../sceneEnv';
import type { SiteLayout } from '../site/layout';
import { bayToSite, headingToRotationY, siteToBay } from '../site/transforms';
import { actorProbe } from './actorProbe';
import { ActorRig, bayMaps, maxTrucks, type GlbPool } from './actorRig';
import { BeltItems, beltTrip, MIN_ITEM_GAP_M } from './beltItems';
import type { ActorFeed } from './feed';
import { ObstacleField } from './obstacles';
import { clearOfWall, plateLines, plateShown, type WallView } from './plateView';
import { ACTOR_LAYER, ACTOR_SOLID_MATERIAL, InstancePool, retain } from './pool';
import { PLATE_BASE_H_PX, PLATE_BASE_PX, type PlateElements } from './TruckPlates';
import { carriesPallet, showsPpeRing, ActorTracks, MAX_FORKLIFTS_PER_BAY } from './tracks';
import { PLATE } from './truckParts';
import { truckTargets, TruckSim } from './truckSim';

// People, forklifts, trucks and items on belts (docs/04 sections 3 and 4). Everything between live messages happens in
// the one useFrame below: positions and headings interpolate into instance buffers, with no React state at all (docs/02
// section 6 rules 1 and 2). Messages arrive through `feed`, at most at the store's 4 Hz; case ticks per item.

interface World {
  tracks: ActorTracks;
  trucks: TruckSim;
  items: BeltItems;
  obstacles: ObstacleField;
  /** Dock wall per face, for the plates. */
  walls: Map<string, WallView>;
}

function createWorld(layout: SiteLayout): World {
  const { bay, face } = bayMaps(layout);
  const walls = new Map<string, WallView>();
  for (const f of layout.faces) {
    walls.set(f.face, {
      doors: f.bays.map((b) => b.localX),
      doorWidth: f.door.width,
      doorTop: layout.floorLevel + f.door.height,
      wallTop: layout.floorLevel + f.door.height + BAND_HEIGHT,
    });
  }
  const trucks = new TruckSim(
    {
      doorX: (id) => bay.get(id)?.localX ?? null,
      slot: (id, n) => face.get(id)?.apron.slots[n - 1] ?? null,
      apronDepth: layout.view.apronDepth,
    },
    maxTrucks(layout),
  );
  const obstacles = new ObstacleField(layout);
  return { tracks: new ActorTracks(obstacles), trucks, items: new BeltItems(), obstacles, walls };
}

/** The GLB parts of the forklift and its pallet, one pool per part, with the forklift's paint from docs/04 section 4. */
function ForkliftModels({ rig, shadows }: { rig: ActorRig; shadows: boolean }) {
  const forklift = useModel('forklift');
  const pallet = useModel('pallet_b01');
  const models = useMemo(() => {
    const cap = rig.maps.bay.size * MAX_FORKLIFTS_PER_BAY;
    const make = (part: (typeof forklift)[number], tone: GlbPool['tone']): GlbPool => ({
      pool: new InstancePool(part.geometry, ACTOR_SOLID_MATERIAL, cap, rig.moving, {
        cast: shadows,
      }),
      tone,
      matrix: new Matrix4().copy(part.matrix),
    });
    const liftPools = forklift.map((p) =>
      make(
        p,
        p.tone === 'brand' ? 'palletYellow' : p.tone === 'brandLight' ? 'truckGlass' : p.tone,
      ),
    );
    const loadPools = pallet.map((p) => make(p, 'palletBlue'));
    const pools = [...liftPools, ...loadPools].map((g) => g.pool);
    return {
      pools,
      lift: liftPools,
      load: loadPools,
      dispose: () => {
        for (const p of pools) p.dispose();
      },
    };
  }, [forklift, pallet, rig, shadows]);

  useLayoutEffect(() => {
    rig.attachGlb(models.lift, models.load);
    const release = retain(models);
    return () => {
      rig.attachGlb(null, null);
      release();
    };
  }, [rig, models]);

  return (
    <>
      {models.pools.map((p) => (
        <primitive key={p.mesh.uuid} object={p.mesh} />
      ))}
    </>
  );
}

export function ActorsLayer({
  layout,
  feed,
  showPlates,
  plates,
}: {
  layout: SiteLayout;
  feed: ActorFeed;
  showPlates: boolean;
  /** The DOM plate elements (TruckPlates), by plate slot. */
  plates: RefObject<PlateElements>;
}) {
  const { palette, quality, shadows, tier } = useSceneEnv();
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const animated = quality.actors.animated;

  const world = useMemo(() => createWorld(layout), [layout]);
  const rig = useMemo(
    () => new ActorRig(layout, palette, quality, shadows),
    [layout, palette, quality, shadows],
  );
  useEffect(() => retain(rig), [rig]);

  // what the frame loop and the subscriptions read; a ref so a tier step does not resubscribe
  const live = useRef({ animated, showPlates });
  useEffect(() => {
    live.current = { animated, showPlates };
  }, [animated, showPlates]);

  useLayoutEffect(() => {
    camera.layers.enable(ACTOR_LAYER);
  }, [camera]);

  useEffect(() => {
    const { tracks, trucks, items } = world;
    const unsubs: (() => void)[] = [];
    const bays = new Map(layout.bays.map((b) => [b.id, b]));
    for (const { id } of layout.bays) {
      const onBay = (b: ReturnType<ActorFeed['getBay']>) =>
        trucks.sync(id, b ? truckTargets(b) : [], performance.now(), live.current.animated);
      onBay(feed.getBay(id));
      unsubs.push(feed.subscribeBay(id, onBay));
      const onFrame = (f: ReturnType<ActorFeed['getActors']>) => {
        if (f) tracks.applyFrame(f, performance.now());
      };
      onFrame(feed.getActors(id));
      unsubs.push(feed.subscribeActors(id, onFrame));
    }
    unsubs.push(
      feed.subscribeCases((tick) => {
        const conveyor = bays.get(tick.bay)?.conveyor;
        if (!live.current.animated || !conveyor) return;
        items.spawn(tick, MIN_ITEM_GAP_M / beltTrip(conveyor));
      }),
    );
    return () => {
      for (const u of unsubs) u();
    };
  }, [feed, layout, world]);

  const clock = useRef<{ last: number; trackSeq: number; frame: number; rig: ActorRig | null }>({
    last: 0,
    trackSeq: -1,
    frame: 0,
    rig: null,
  });
  const v = useMemo(() => ({ a: new Vector3(), b: new Vector3(), c: new Vector3() }), []);

  useFrame(() => {
    const now = performance.now();
    const c = clock.current;
    const dt = c.last === 0 ? 0 : Math.min(250, now - c.last);
    c.last = now;
    const isAnimated = live.current.animated;
    const { tracks, trucks, items } = world;

    tracks.update(now, dt, isAnimated);
    const moved = trucks.update(now, dt, isAnimated);
    if (isAnimated) {
      items.update(
        dt,
        (bay) => {
          const b = rig.maps.bay.get(bay)?.conveyor;
          return b ? beltTrip(b) : 1;
        },
        (bay) => feed.getBay(bay)?.belt.status,
      );
    }

    // Low only redraws when a frame has come in or the rig is new; the other tiers animate limbs every frame
    if (isAnimated || c.trackSeq !== tracks.seq || c.rig !== rig) {
      c.trackSeq = tracks.seq;
      c.rig = rig;
      rig.beginActors();
      for (const t of tracks.tracks.values()) rig.drawTrack(t, now / 1000);
      // items after the people: a flagged item's pin shares their pools
      if (isAnimated) rig.drawItems(items.items);
      rig.endActors();
    }
    if (rig.trucksStale(trucks.seq) || moved) rig.drawTrucks(trucks.trucks.values());

    // ---- plates ----
    const used = new Set<number>();
    if (live.current.showPlates) {
      for (const truck of trucks.trucks.values()) {
        const el = plates.current.get(truck.plateSlot);
        const face = rig.maps.face.get(truck.bay);
        if (!el || !face) continue;
        const rot = headingToRotationY(face.face, truck.h);
        const origin = bayToSite(
          face.face,
          face.origin,
          { x: truck.x, y: truck.y, z: 0 },
          layout.floorLevel,
        );
        const sin = Math.sin(rot);
        const cos = Math.cos(rot);
        // the rear of a truck is +Z in its own frame
        const X = origin.X - sin * PLATE.l;
        const Z = origin.Z - cos * PLATE.l;
        const Y = origin.Y + PLATE.z;
        const toCam = v.a.set(camera.position.x - X, camera.position.y - Y, camera.position.z - Z);
        const facing = (sin * toCam.x + cos * toCam.z) / (toCam.length() || 1);
        v.a.set(X, Y, Z).project(camera);
        v.b.set(X + (cos * PLATE.width) / 2, Y, Z - (sin * PLATE.width) / 2).project(camera);
        // the plate's width and height as screen vectors (CSS pixels, y down), so the element lies on its real plane
        const rx = (v.b.x - v.a.x) * size.width;
        const ry = -(v.b.y - v.a.y) * size.height;
        v.c.set(X, Y + PLATE.height / 2, Z).project(camera);
        const ux = (v.c.x - v.a.x) * size.width;
        const uy = -(v.c.y - v.a.y) * size.height;
        const widthPx = Math.hypot(rx, ry);
        const cam = siteToBay(
          face.face,
          face.origin,
          { X: camera.position.x, Y: camera.position.y, Z: camera.position.z },
          layout.floorLevel,
        );
        const wall = world.walls.get(face.face);
        const clear =
          !wall ||
          clearOfWall(
            { x: cam.x, y: cam.y, h: camera.position.y },
            { x: truck.x, y: truck.y, h: Y },
            wall,
          );
        if (truck.fade < 0.5 || v.a.z >= 1 || !plateShown(facing, widthPx, clear)) continue;
        used.add(truck.plateSlot);
        const x = ((v.a.x + 1) / 2) * size.width;
        const y = ((1 - v.a.y) / 2) * size.height;
        const m = [
          rx / PLATE_BASE_PX,
          ry / PLATE_BASE_PX,
          -ux / PLATE_BASE_H_PX,
          -uy / PLATE_BASE_H_PX,
        ].map((n) => n.toFixed(4));
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) matrix(${m.join()}, 0, 0) translate(-50%, -50%)`;
        if (el.dataset.visit !== truck.visitId) {
          el.dataset.visit = truck.visitId;
          const lines = el.firstElementChild?.children;
          const [first, second] = plateLines(truck.plate.bn);
          if (lines?.[0]) lines[0].textContent = first;
          if (lines?.[1]) lines[1].textContent = second;
          if (lines?.[2]) lines[2].textContent = truck.plate.en;
        }
        if (el.style.visibility !== 'visible') el.style.visibility = 'visible';
      }
    }
    for (const i of plates.current.keys()) {
      const el = plates.current.get(i);
      if (!el) continue;
      if (!used.has(i) && el.style.visibility !== 'hidden') el.style.visibility = 'hidden';
    }

    if (QUALITY_DEBUG && c.frame++ % 15 === 0) {
      const counts = { waiting: 0, reversing: 0, docked: 0, departing: 0 };
      const dockedBays: string[] = [];
      for (const t of trucks.trucks.values()) {
        counts[t.state]++;
        if (t.state === 'docked' && t.door >= 1) dockedBays.push(t.bay);
      }
      let people = 0;
      let forklifts = 0;
      let ppeRings = 0;
      const carrying: string[] = [];
      const crewBays: string[] = [];
      for (const t of tracks.tracks.values()) {
        if (t.actor.kind === 'FORKLIFT') {
          forklifts++;
          if (carriesPallet(t.actor)) carrying.push(t.bay);
        } else {
          people++;
          if (t.actor.role === 'CAPTAIN') crewBays.push(t.bay);
          if (showsPpeRing(t.actor)) ppeRings++;
          actorProbe.personSamples++;
          if (world.obstacles.isInside(t.bay, t.actor.x, t.actor.y, 0)) actorProbe.dataInProps++;
          if (world.obstacles.isInside(t.bay, t.x, t.y, 0)) actorProbe.drawnInProps++;
        }
      }
      actorProbe.people = people;
      actorProbe.forklifts = forklifts;
      actorProbe.carrying = carrying;
      actorProbe.trucks = counts;
      actorProbe.items = items.items.length;
      actorProbe.ppeRings = ppeRings;
      actorProbe.dockedBays = dockedBays;
      actorProbe.crewBays = crewBays;
      actorProbe.itemBays = [...new Set(items.items.map((i) => i.bay))];
    }
  });

  return (
    <group name="actors">
      {rig.pools.map((p) => (
        <primitive key={p.mesh.uuid} object={p.mesh} />
      ))}
      {tier !== 'low' && (
        <ModelBoundary fallback={null}>
          <Suspense fallback={null}>
            <ForkliftModels rig={rig} shadows={shadows} />
          </Suspense>
        </ModelBoundary>
      )}
    </group>
  );
}
