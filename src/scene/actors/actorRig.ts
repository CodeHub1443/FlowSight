import {
  CapsuleGeometry,
  Color,
  type BufferGeometry,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  RingGeometry,
  Vector3,
} from 'three';
import {
  BOX_DEPTH_MATERIAL,
  ROUND,
  UNIT_PLANE,
  unitBox,
  unitCylinder,
  unitSphere,
} from '../geometry';
import { conveyorFrame, beltTop } from '../bay/bayItems';
import { radialTexture } from '../labels/textures';
import { finishOf, type PaletteKey, type ScenePalette } from '../materials';
import type { QualitySettings } from '../quality';
import type { BayLayout, FaceLayout, SiteLayout } from '../site/layout';
import { bayToSite, headingToRotationY } from '../site/transforms';
import {
  beltSpan,
  CARTON_DIMS,
  CARTON_TONE_FACTOR,
  cartonSizeOf,
  cartonToneOf,
  itemScale,
  itemY,
  MAX_ITEMS_PER_BAY,
  type BeltItem,
} from './beltItems';
import { personPose } from './personPose';
import { ACTOR_BOX_MATERIAL, ACTOR_SOLID_MATERIAL, InstancePool, InstanceStore } from './pool';
import {
  carriesPallet,
  MAX_FORKLIFTS_PER_BAY,
  MAX_PEOPLE_PER_BAY,
  showsPpeRing,
  type ActorTrack,
} from './tracks';
import {
  DOOR_OPEN_RAD,
  doorHingeX,
  partTone,
  TRUCK_PARTS,
  TRUCK_WHEELS,
  TRUCK_WHEELS_LOW,
  type PartPool,
} from './truckParts';
import { TRUCK_LENGTH, type Truck } from './truckSim';

// Everything the actor layer draws, as fixed-capacity instance pools shared by every bay: a person costs no draw call
// of its own, the whole cast is about 15 (docs/02 section 6 rule 3). Filled from useFrame; nothing here touches React.
//
// Local frames: all actors are modelled facing three -Z (contract heading 0 = bay +y = three -Z on the S face), origin
// on the ground under the actor; a truck's origin is the middle of its rear sill.

const _base = new Matrix4();
const _m = new Matrix4();
const _hinge = new Matrix4();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _v = new Vector3();
const _s = new Vector3();
const X_AXIS = new Vector3(1, 0, 0);
const Y_AXIS = new Vector3(0, 1, 0);
const Z_AXIS = new Vector3(0, 0, 1);
const NO_ROTATION = new Quaternion();
/** Blobs and rings carry their tint in the material: the instance colour stays white. */
const BLOB_WHITE = new Color(1, 1, 1);

/** The GLB forks point along +Z: turned to face -Z like every other actor. */
const GLB_TO_ACTOR = new Matrix4().makeRotationY(Math.PI);
/** Where a carried pallet rides on the forks (actor frame). */
const PALLET_AT = { y: 0.2, z: -1.38 } as const;
const PALLET_TOP = 0.21;

/** Proportions of the person (1.7 m, docs/04 section 4), chunky per docs/06 D6. */
const HIP_Y = 0.84;
const LEG_R = 0.095;
const LEG_X = 0.11;
const SHOULDER_Y = 1.38;
const SHOULDER_X = 0.27;
const ARM_LEN = 0.62;
const ARM_R = 0.07;
const TORSO = { y: 1.12, height: 0.72, rx: 0.2, rz: 0.155 } as const;
const HEAD = { y: 1.565, r: 0.135 } as const;
const VEST = { y: 1.14, w: 0.46, h: 0.54, d: 0.34 } as const;

/** docs/04 section 4: a seated operator, placed in the GLB's seat. */
const SEAT = { y: 1.0, z: 0.5 } as const;

/** Bay-frame forklift of the Low tier and of the moment the GLB is still loading, in three axes (forward = -Z). */
const FORKLIFT_BOXES: readonly {
  at: readonly [number, number, number];
  size: readonly [number, number, number];
  tone: PaletteKey;
}[] = [
  { at: [0, 0.68, 0.35], size: [1.2, 0.86, 1.9], tone: 'palletYellow' },
  { at: [0, 0.6, 1.2], size: [1.1, 0.7, 0.5], tone: 'belt' },
  { at: [-0.5, 1.5, -0.25], size: [0.08, 1.2, 0.08], tone: 'belt' },
  { at: [0.5, 1.5, -0.25], size: [0.08, 1.2, 0.08], tone: 'belt' },
  { at: [-0.5, 1.5, 0.95], size: [0.08, 1.2, 0.08], tone: 'belt' },
  { at: [0.5, 1.5, 0.95], size: [0.08, 1.2, 0.08], tone: 'belt' },
  { at: [0, 2.12, 0.35], size: [1.16, 0.08, 1.4], tone: 'metal' },
  { at: [-0.4, 1.08, -0.72], size: [0.12, 2.1, 0.14], tone: 'ink600' },
  { at: [0.4, 1.08, -0.72], size: [0.12, 2.1, 0.14], tone: 'ink600' },
  { at: [0, 2.04, -0.72], size: [0.9, 0.1, 0.12], tone: 'ink600' },
  { at: [-0.28, 0.13, -1.34], size: [0.12, 0.07, 1.2], tone: 'belt' },
  { at: [0.28, 0.13, -1.34], size: [0.12, 0.07, 1.2], tone: 'belt' },
  { at: [-0.58, 0.25, -0.2], size: [0.24, 0.5, 0.5], tone: 'belt' },
  { at: [0.58, 0.25, -0.2], size: [0.24, 0.5, 0.5], tone: 'belt' },
  { at: [-0.58, 0.25, 1.05], size: [0.24, 0.5, 0.5], tone: 'belt' },
  { at: [0.58, 0.25, 1.05], size: [0.24, 0.5, 0.5], tone: 'belt' },
];

/** Most trucks at once: one docked and one driving off per bay, plus every holding slot. */
export function maxTrucks(layout: SiteLayout): number {
  return layout.bays.length * 2 + layout.faces.reduce((n, f) => n + f.apron.slots.length, 0);
}

/** Most GLB parts one forklift and its pallet may have (5 + 1 in the current files). */
export const GLB_PARTS_MAX = 12;

const partCount = (pool: PartPool) => TRUCK_PARTS.filter((p) => p.pool === pool).length;

export interface GlbPool {
  pool: InstancePool;
  tone: PaletteKey;
  matrix: Matrix4;
}

export interface BayMaps {
  bay: Map<string, BayLayout>;
  face: Map<string, FaceLayout>;
}

export function bayMaps(layout: SiteLayout): BayMaps {
  const bay = new Map(layout.bays.map((b) => [b.id, b]));
  const face = new Map<string, FaceLayout>();
  for (const f of layout.faces) for (const b of f.bays) face.set(b.id, f);
  return { bay, face };
}

/** Rows for what moves most frames, and for the trucks, which mostly stand still. */
interface ActorStores {
  moving: InstanceStore;
  standing: InstanceStore;
}

/**
 * One set per rig, never shared with the next one: disposing a pool deletes the GL buffer behind its attributes, and a
 * rig built on the same store would keep drawing from the deleted buffer's frozen contents (its VAO is not rebound).
 */
function createStores(layout: SiteLayout): ActorStores {
  const bays = layout.bays.length;
  const people = (MAX_PEOPLE_PER_BAY + MAX_FORKLIFTS_PER_BAY) * bays;
  const trucks = maxTrucks(layout);
  return {
    moving: new InstanceStore(
      people * 5 + // limbs
        (people + bays * 2) + // heads
        (people * 4 + bays * (FORKLIFT_BOXES.length + 5)) + // boxes
        people * 2 + // rings, blobs
        MAX_ITEMS_PER_BAY * bays * 2 + // a carton and its tape
        bays * MAX_FORKLIFTS_PER_BAY * GLB_PARTS_MAX,
    ),
    standing: new InstanceStore(trucks * (TRUCK_PARTS.length + TRUCK_WHEELS.length * 2 + 1)),
  };
}

export class ActorRig {
  readonly maps: BayMaps;
  readonly pools: InstancePool[] = [];
  readonly moving: InstanceStore;
  private readonly standing: InstanceStore;
  private truckSeq = -1;
  private forkliftGlb: GlbPool[] | null = null;
  private palletGlb: GlbPool[] | null = null;

  private readonly colors = new Map<PaletteKey, Color>();
  private readonly limbs: InstancePool;
  private readonly heads: InstancePool;
  private readonly boxes: InstancePool;
  private readonly rings: InstancePool;
  private readonly blobs: InstancePool;
  private readonly truckShell: InstancePool;
  private readonly truckSolid: InstancePool;
  private readonly truckFlat: InstancePool;
  private readonly wheels: InstancePool;
  private readonly truckBlobs: InstancePool;
  private readonly itemCase: InstancePool | null;
  private readonly kraft: Record<'light' | 'medium', Color>;
  private readonly materials: MeshBasicMaterial[];

  constructor(
    private readonly layout: SiteLayout,
    private readonly palette: ScenePalette,
    private readonly quality: QualitySettings,
    shadows: boolean,
  ) {
    this.maps = bayMaps(layout);
    const bays = layout.bays.length;
    const people = (MAX_PEOPLE_PER_BAY + MAX_FORKLIFTS_PER_BAY) * bays;
    const trucks = maxTrucks(layout);
    const { capsule, sphere } = quality.actors;
    const lo = unitBox(quality.smoothness.lo);
    const hi = unitBox(quality.smoothness.hi);
    const flat = unitBox(0);
    const capsuleGeo = new CapsuleGeometry(1, 1, capsule[0], capsule[1]);
    const sphereGeo = unitSphere(sphere);
    const boxCap = people * 4 + bays * (FORKLIFT_BOXES.length + 5);
    const itemCap = quality.actors.animated ? MAX_ITEMS_PER_BAY * bays : 0;
    const stores = createStores(layout);
    this.moving = stores.moving;
    this.standing = stores.standing;
    const boxOpts = { cast: shadows, depth: BOX_DEPTH_MATERIAL };
    const solidOpts = { cast: shadows };

    const shade = palette.shade;
    const blobMaterial = new MeshBasicMaterial({
      map: radialTexture(1),
      color: shade,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const ringMaterial = new MeshBasicMaterial({ color: palette.statusWarn });
    this.materials = [blobMaterial, ringMaterial];

    const mv = this.moving;
    const st = this.standing;
    this.limbs = this.pool(capsuleGeo, ACTOR_SOLID_MATERIAL, people * 5, mv, solidOpts);
    this.heads = this.pool(sphereGeo, ACTOR_SOLID_MATERIAL, people + bays * 2, mv, solidOpts);
    this.boxes = this.pool(lo, ACTOR_BOX_MATERIAL, boxCap, mv, boxOpts);
    this.rings = this.pool(
      new RingGeometry(0.42, 0.56, quality.cylinderSegments).rotateX(-Math.PI / 2),
      ringMaterial,
      people,
      mv,
    );
    this.blobs = this.pool(UNIT_PLANE, blobMaterial, people, mv);
    this.truckShell = this.pool(hi, ACTOR_BOX_MATERIAL, partCount('shell') * trucks, st, boxOpts);
    this.truckSolid = this.pool(lo, ACTOR_BOX_MATERIAL, partCount('solid') * trucks, st, boxOpts);
    this.truckFlat = this.pool(flat, ACTOR_BOX_MATERIAL, partCount('flat') * trucks, st, {
      depth: BOX_DEPTH_MATERIAL,
    });
    this.wheels = this.pool(
      unitCylinder(quality.cylinderSegments),
      ACTOR_SOLID_MATERIAL,
      TRUCK_WHEELS.length * trucks * 2,
      st,
      solidOpts,
    );
    this.truckBlobs = this.pool(UNIT_PLANE, blobMaterial, trucks, st);
    if (quality.actors.animated) {
      this.itemCase = this.pool(lo, ACTOR_BOX_MATERIAL, itemCap * 2, mv, boxOpts);
    } else {
      this.itemCase = null;
    }
    const kraftBase = new Color(palette.carton);
    this.kraft = {
      light: kraftBase.clone().multiplyScalar(CARTON_TONE_FACTOR.light),
      medium: kraftBase.clone().multiplyScalar(CARTON_TONE_FACTOR.medium),
    };
  }

  private pool(
    geometry: BufferGeometry,
    material: ConstructorParameters<typeof InstancePool>[1],
    capacity: number,
    store: InstanceStore,
    opts?: ConstructorParameters<typeof InstancePool>[4],
  ): InstancePool {
    const p = new InstancePool(geometry, material, capacity, store, opts);
    this.pools.push(p);
    return p;
  }

  dispose(): void {
    for (const p of this.pools) p.dispose();
    for (const m of this.materials) m.dispose();
  }

  /** The loaded GLB parts of the forklift and its pallet; until then (and on Low) both are procedural. */
  attachGlb(forklift: GlbPool[] | null, pallet: GlbPool[] | null): void {
    this.forkliftGlb = forklift;
    this.palletGlb = pallet;
  }

  /** True once per new `seq`: the trucks' buffers need rewriting. */
  trucksStale(seq: number): boolean {
    if (this.truckSeq === seq) return false;
    this.truckSeq = seq;
    return true;
  }

  private color(tone: PaletteKey): Color {
    let c = this.colors.get(tone);
    if (!c) {
      c = new Color(this.palette[tone]);
      this.colors.set(tone, c);
    }
    return c;
  }

  private box(
    pool: InstancePool,
    parent: Matrix4,
    x: number,
    y: number,
    z: number,
    q: Quaternion,
    sx: number,
    sy: number,
    sz: number,
    tone: PaletteKey,
    fade: number,
    round: number = ROUND,
  ): void {
    _m.compose(_v.set(x, y, z), q, _s.set(sx, sy, sz)).premultiply(parent);
    pool.add(_m, this.color(tone), finishOf(tone), round, fade);
  }

  /** A capsule hanging from (x, y, z), swung forward by `pitch`. The unit capsule is 3 long. */
  private limb(
    parent: Matrix4,
    x: number,
    y: number,
    z: number,
    pitch: number,
    radius: number,
    length: number,
    tone: PaletteKey,
    fade: number,
  ): void {
    _q.setFromAxisAngle(X_AXIS, pitch);
    const half = length / 2;
    this.box(
      this.limbs,
      parent,
      x,
      y - half * Math.cos(pitch),
      z - half * Math.sin(pitch),
      _q,
      radius,
      length / 3,
      radius,
      tone,
      fade,
      0,
    );
  }

  private blob(pool: InstancePool, parent: Matrix4, l: number, sx: number, sz: number, y: number) {
    _q.setFromAxisAngle(X_AXIS, -Math.PI / 2);
    _m.compose(_v.set(0, y, -l), _q, _s.set(sx, sz, 1)).premultiply(parent);
    pool.add(_m, BLOB_WHITE, finishOf('card'), 0, 1);
  }

  // ---- people and forklifts ----------------------------------------------------------------------------------------

  beginActors(): void {
    for (const p of [this.limbs, this.heads, this.boxes, this.rings, this.blobs]) p.begin();
    if (this.forkliftGlb) for (const g of this.forkliftGlb) g.pool.begin();
    if (this.palletGlb) for (const g of this.palletGlb) g.pool.begin();
  }

  endActors(): void {
    for (const p of [this.limbs, this.heads, this.boxes, this.rings, this.blobs]) p.end();
    if (this.forkliftGlb) for (const g of this.forkliftGlb) g.pool.end();
    if (this.palletGlb) for (const g of this.palletGlb) g.pool.end();
    this.moving.flush();
  }

  private actorBase(t: ActorTrack, lift: number): boolean {
    const bay = this.maps.bay.get(t.bay);
    if (!bay) return false;
    const p = bayToSite(
      bay.face,
      bay.door,
      { x: t.x + t.sepX, y: t.y + t.sepY, z: 0 },
      this.layout.floorLevel,
    );
    _base.makeRotationY(headingToRotationY(bay.face, t.h));
    _base.setPosition(p.X, p.Y + lift, p.Z);
    return true;
  }

  drawTrack(t: ActorTrack, seconds: number): void {
    if (t.actor.kind === 'FORKLIFT') this.drawForklift(t);
    else this.drawPerson(t, seconds);
  }

  private drawPerson(t: ActorTrack, seconds: number): void {
    const animated = this.quality.actors.animated;
    const pose = personPose(animated ? t.actor.act : 'STATIONARY', seconds, t.seed);
    if (!this.actorBase(t, pose.bob)) return;
    const base = _base;
    const fade = t.fade;
    const captain = t.actor.role === 'CAPTAIN';

    // the blob stays on the floor, whatever the figure's bob
    if (t.fade > 0.05) {
      const by = -pose.bob + 0.018;
      this.blob(this.blobs, base, 0, 1.1, 1.1, by);
    }
    if (showsPpeRing(t.actor)) {
      _m.compose(_v.set(0, -pose.bob + 0.03, 0), NO_ROTATION, _s.set(fade, 1, fade)).premultiply(
        base,
      );
      this.rings.add(_m, BLOB_WHITE, finishOf('card'), 0, 1);
    }

    if (!animated) {
      // Low tier: a static figure, the vest colour on the body
      const body: PaletteKey = captain ? 'actorVest' : 'actorShirt';
      this.box(this.limbs, base, 0, 0.76, 0, NO_ROTATION, 0.24, 1.46 / 3, 0.2, body, fade, 0);
      this.box(
        this.heads,
        base,
        0,
        HEAD.y,
        0,
        NO_ROTATION,
        HEAD.r,
        HEAD.r,
        HEAD.r,
        'actorSkin',
        fade,
        0,
      );
      return;
    }

    this.limb(base, -LEG_X, HIP_Y, 0, pose.legL, LEG_R, HIP_Y, 'actorTrousers', fade);
    this.limb(base, LEG_X, HIP_Y, 0, pose.legR, LEG_R, HIP_Y, 'actorTrousers', fade);

    // the upper body leans from the hips
    const leanZ = (dy: number) => -pose.lean * dy;
    _q2.setFromAxisAngle(X_AXIS, -pose.lean);
    this.box(
      this.limbs,
      base,
      0,
      TORSO.y,
      leanZ(TORSO.y - HIP_Y),
      _q2,
      TORSO.rx,
      TORSO.height / 3,
      TORSO.rz,
      'actorShirt',
      fade,
      0,
    );
    const shoulderZ = leanZ(SHOULDER_Y - HIP_Y);
    this.limb(
      base,
      -SHOULDER_X,
      SHOULDER_Y,
      shoulderZ,
      pose.armL,
      ARM_R,
      ARM_LEN,
      'actorShirt',
      fade,
    );
    this.limb(
      base,
      SHOULDER_X,
      SHOULDER_Y,
      shoulderZ,
      pose.armR,
      ARM_R,
      ARM_LEN,
      'actorShirt',
      fade,
    );
    this.box(
      this.heads,
      base,
      0,
      HEAD.y,
      leanZ(HEAD.y - HIP_Y),
      NO_ROTATION,
      HEAD.r,
      HEAD.r,
      HEAD.r,
      'actorSkin',
      fade,
      0,
    );

    const vestZ = leanZ(VEST.y - HIP_Y);
    if (captain) {
      // full hi-vis vest with silver bands, dark scanner in the right hand
      _q.copy(_q2);
      this.box(this.boxes, base, 0, VEST.y, vestZ, _q, VEST.w, VEST.h, VEST.d, 'actorVest', fade);
      for (const dy of [-0.13, 0.08]) {
        this.box(
          this.boxes,
          base,
          0,
          VEST.y + dy,
          vestZ,
          _q,
          VEST.w + 0.012,
          0.05,
          VEST.d + 0.012,
          'actorBand',
          fade,
          0.3,
        );
      }
      const hx = SHOULDER_X;
      const hy = SHOULDER_Y - ARM_LEN * Math.cos(pose.armR);
      const hz = shoulderZ - ARM_LEN * Math.sin(pose.armR);
      _q.setFromAxisAngle(X_AXIS, pose.armR);
      this.box(this.boxes, base, hx, hy, hz, _q, 0.08, 0.2, 0.13, 'belt', fade);
    } else if (t.actor.role === 'WORKER') {
      // cross-strap (X) vest: the two straps cross on chest and back
      for (const s of [-1, 1]) {
        _q.setFromAxisAngle(Z_AXIS, s * 0.6).premultiply(_q2);
        this.box(
          this.boxes,
          base,
          0,
          VEST.y,
          vestZ,
          _q,
          0.075,
          VEST.h + 0.12,
          VEST.d + 0.012,
          'actorVest',
          fade,
          0.25,
        );
      }
    }
    if (pose.carrying) {
      _q.identity();
      this.box(this.boxes, base, 0, 1.13, -0.42, _q, 0.5, 0.34, 0.34, 'carton', fade);
    }
  }

  private drawForklift(t: ActorTrack): void {
    if (!this.actorBase(t, 0)) return;
    const base = _base;
    const fade = t.fade;
    const carrying = carriesPallet(t.actor);
    if (fade > 0.05) this.blob(this.blobs, base, 0, 2.6, 4.4, 0.018);

    const glb = this.forkliftGlb;
    if (glb) {
      for (const part of glb) {
        _m.multiplyMatrices(base, GLB_TO_ACTOR).multiply(part.matrix);
        part.pool.add(_m, this.color(part.tone), finishOf(part.tone), 0, fade);
      }
      // the operator, seated: legs stay hidden in the cab
      this.box(
        this.limbs,
        base,
        0,
        SEAT.y + 0.32,
        SEAT.z,
        NO_ROTATION,
        TORSO.rx,
        0.62 / 3,
        TORSO.rz,
        'actorShirt',
        fade,
        0,
      );
      this.limb(base, -0.26, SEAT.y + 0.5, SEAT.z - 0.05, 1.15, ARM_R, 0.55, 'actorShirt', fade);
      this.limb(base, 0.26, SEAT.y + 0.5, SEAT.z - 0.05, 1.15, ARM_R, 0.55, 'actorShirt', fade);
      this.box(
        this.heads,
        base,
        0,
        SEAT.y + 0.8,
        SEAT.z,
        NO_ROTATION,
        HEAD.r,
        HEAD.r,
        HEAD.r,
        'actorSkin',
        fade,
        0,
      );
    } else {
      for (const b of FORKLIFT_BOXES) {
        this.box(
          this.boxes,
          base,
          b.at[0],
          b.at[1],
          b.at[2],
          NO_ROTATION,
          b.size[0],
          b.size[1],
          b.size[2],
          b.tone,
          fade,
        );
      }
    }

    if (!carrying) return;
    if (this.palletGlb) {
      for (const part of this.palletGlb) {
        _m.compose(_v.set(0, PALLET_AT.y, PALLET_AT.z), NO_ROTATION, _s.set(1, 1, 1))
          .premultiply(base)
          .multiply(part.matrix);
        part.pool.add(_m, this.color(part.tone), finishOf(part.tone), 0, fade);
      }
    } else {
      this.box(
        this.boxes,
        base,
        0,
        PALLET_AT.y + 0.1,
        PALLET_AT.z,
        NO_ROTATION,
        1.2,
        0.2,
        1,
        'palletBlue',
        fade,
      );
    }
    // a load on the pallet: four cartons, big enough to read (docs/06 D6)
    const y = PALLET_AT.y + PALLET_TOP + 0.26;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        this.box(
          this.boxes,
          base,
          sx * 0.29,
          y,
          PALLET_AT.z + sz * 0.24,
          NO_ROTATION,
          0.56,
          0.5,
          0.46,
          sz > 0 ? 'carton' : 'cartonTape',
          fade,
        );
      }
    }
  }

  // ---- trucks ---------------------------------------------------------------------------------------------------

  private truckPool(pool: PartPool): InstancePool {
    return pool === 'shell' ? this.truckShell : pool === 'solid' ? this.truckSolid : this.truckFlat;
  }

  drawTrucks(trucks: Iterable<Truck>): void {
    const pools = [this.truckShell, this.truckSolid, this.truckFlat, this.wheels, this.truckBlobs];
    for (const p of pools) p.begin();
    const animated = this.quality.actors.animated;
    const wheels = animated ? TRUCK_WHEELS : TRUCK_WHEELS_LOW;
    for (const truck of trucks) {
      const face = this.maps.face.get(truck.bay);
      if (!face) continue;
      const p = bayToSite(
        face.face,
        face.origin,
        { x: truck.x, y: truck.y, z: 0 },
        this.layout.floorLevel,
      );
      _base.makeRotationY(headingToRotationY(face.face, truck.h));
      _base.setPosition(p.X, p.Y, p.Z);
      const fade = truck.fade;
      if (fade > 0.05) {
        // a soft shadow under the van: the shadow map stops at the wall on Med, and the yard has no contact plane
        this.blob(this.truckBlobs, _base, TRUCK_LENGTH / 2, 3.8, 11.5, 0.02);
      }
      const angle = truck.door * DOOR_OPEN_RAD;
      for (const part of TRUCK_PARTS) {
        if (animated ? part.lowOnly : !part.low) continue;
        if (part.inside && truck.door <= 0.02) continue;
        const tone = partTone(part, truck.livery);
        const pool = this.truckPool(part.pool);
        // bay-style coordinates: x, l along the truck (three -Z), z up (three Y)
        let parent = _base;
        if (part.door) {
          const hx = doorHingeX(part.door);
          _hinge
            .makeRotationY(part.door * angle)
            .setPosition(hx, 0, 0)
            .premultiply(_base);
          _hinge.multiply(_m.makeTranslation(-hx, 0, 0));
          parent = _hinge;
        }
        this.box(
          pool,
          parent,
          part.at[0],
          part.at[2],
          -part.at[1],
          NO_ROTATION,
          part.size[0],
          part.size[2],
          part.size[1],
          tone,
          fade,
          part.pool === 'flat' ? 0 : (part.round ?? ROUND),
        );
      }
      _q.setFromAxisAngle(Z_AXIS, Math.PI / 2);
      for (const w of wheels) {
        this.box(
          this.wheels,
          _base,
          w.x,
          w.radius,
          -w.l,
          _q,
          w.radius,
          w.width,
          w.radius,
          'belt',
          fade,
          0,
        );
        if (animated) {
          this.box(
            this.wheels,
            _base,
            w.x + Math.sign(w.x) * 0.03,
            w.radius,
            -w.l,
            _q,
            w.radius * 0.5,
            w.width,
            w.radius * 0.5,
            'metal',
            fade,
            0,
          );
        }
      }
    }
    for (const p of pools) p.end();
    this.standing.flush();
  }

  // ---- belt items --------------------------------------------------------------------------------------------------

  /** `extendOf` gives how far a bay's boom has run out (metres): the trip of its items starts at the moving tip. */
  drawItems(items: readonly BeltItem[], extendOf?: (bay: string) => number): void {
    const { itemCase } = this;
    if (!itemCase) return;
    const carton = finishOf('carton');
    const tape = this.color('cartonTape');
    itemCase.begin();
    for (const it of items) {
      const bay = this.maps.bay.get(it.bay);
      if (!bay) continue;
      const c = bay.conveyor;
      const y = itemY(it, beltSpan(c, extendOf?.(it.bay)));
      const s = itemScale(it.k);
      if (s <= 0) continue;
      const size = CARTON_DIMS[cartonSizeOf(it.variant)];
      const top = beltTop(c, y);
      const p = bayToSite(bay.face, bay.door, { x: it.x, y, z: top }, this.layout.floorLevel);
      _base.makeRotationY(headingToRotationY(bay.face, 0));
      _base.setPosition(p.X, p.Y, p.Z);
      _q.setFromAxisAngle(X_AXIS, conveyorFrame(c).pitch);
      _q2.setFromAxisAngle(Y_AXIS, it.yaw);
      _q.multiply(_q2);
      const h = size[2] * s;
      const w = size[0] * s;
      const d = size[1] * s;
      // kraft body, rounded like the pallet cartons, with a lighter tape strip across the top (docs/06 section 2)
      _m.compose(_v.set(0, h / 2, 0), _q, _s.set(w, h, d)).premultiply(_base);
      itemCase.add(_m, this.kraft[cartonToneOf(it.variant)], carton, ROUND, 1);
      _m.compose(_v.set(0, h, 0), _q, _s.set(w * 0.18, 0.012, d + 0.01)).premultiply(_base);
      itemCase.add(_m, tape, carton, 0, 1);
      if (it.flagged) {
        // a small pin above a flagged item (docs/04 section 3)
        this.box(
          this.boxes,
          _base,
          0,
          h + 0.25,
          0,
          NO_ROTATION,
          0.05,
          0.45,
          0.05,
          'statusCritical',
          1,
          0.4,
        );
        const r = 0.13;
        this.box(this.heads, _base, 0, h + 0.55, 0, NO_ROTATION, r, r, r, 'statusCritical', 1, 0);
      }
    }
    itemCase.end();
  }
}
