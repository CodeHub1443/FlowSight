import type { SiteConfig } from '../../domain/types';
import {
  bayToSite,
  faceYaw,
  siteToBay,
  type DoorOrigin,
  type Face,
  type SitePoint,
} from './transforms';
import { hashString, rng } from './random';

// Pure, three.js-free site layout derived from a SiteConfig. Components only render what this returns, so the
// builder is generic (any dock face(s), any bay count, no hard-coded site numbers) and unit-testable.

type Range = readonly [number, number];

export interface BayZones {
  workZone: { x: Range; y: Range };
  staging: { x: Range; y: Range };
  aisle: Range;
  storage: Range;
}

/** A camera mount of a bay (config `cameraTemplate`, bay frame with z above the dock floor) and its place in the site frame. */
export interface CameraMount {
  /** Camera id as in the health frame and on events: `B04-CREW`. */
  id: string;
  role: 'DOCK' | 'CREW' | 'BELT';
  /** The config's word for what it looks at (`yard`, `door`, `down`). */
  looks: string;
  mount: { x: number; y: number; z: number };
  at: SitePoint;
}

export interface BayLayout {
  id: string;
  label: { en: string; bn: string };
  conveyorName: string;
  face: Face;
  /** Index in the face's door order (W to E for bayOrder W_TO_E). */
  index: number;
  /** Door centre on the footprint edge, site X/Z. */
  door: DoorOrigin;
  /** Door x in the face frame (x along the face as seen from the yard). */
  localX: number;
  yaw: number;
  /** Width of this bay's slot along the face. */
  pitch: number;
  zones: BayZones;
  /** The bay's cameras, in config order (3 at the Dhaka depot). */
  cameras: CameraMount[];
  conveyor: {
    fixedFrom: number;
    fixedTo: number;
    boomMaxReach: number;
    width: number;
    /** Site position of the boom tip when retracted (y = fixedFrom) and of the far end of the body (y = fixedTo), at dock floor level. */
    start: SitePoint;
    end: SitePoint;
  };
}

export interface HoldingSlot {
  /** Face-frame centre x, y (negative = outside) and size (along x, along y). */
  x: number;
  y: number;
  w: number;
  d: number;
}

export interface FaceLayout {
  face: Face;
  /** Midpoint of the face on the footprint edge, site X/Z. */
  origin: DoorOrigin;
  yaw: number;
  /** Length of the face along its axis and interior depth perpendicular to it. */
  length: number;
  depth: number;
  pitch: number;
  door: { width: number; height: number };
  bays: BayLayout[];
  apron: { depth: number; length: number; guideLineLength: number; slots: HoldingSlot[] };
}

export type ContextItem =
  | { type: 'road'; center: { X: number; Z: number }; size: [number, number] }
  | { type: 'building'; center: { X: number; Z: number }; size: [number, number, number] }
  | { type: 'trees'; positions: { X: number; Z: number }[] };

export interface SurroundTree {
  X: number;
  Z: number;
  height: number;
  /** Crown radius. */
  crown: number;
}

/** The ring road: a rounded ring centred on `center`, outer size `width` x `depth`, `road` wide, and what stands by it. */
export interface SurroundLayout {
  center: { X: number; Z: number };
  width: number;
  depth: number;
  road: number;
  radius: number;
  dashes: { X: number; Z: number; alongX: boolean; length: number }[];
  trees: SurroundTree[];
}

export interface SiteLayout {
  id: string;
  floorLevel: number;
  footprint: { width: number; depth: number };
  view: SiteConfig['view'];
  facade: SiteConfig['building']['facade'];
  eaveHeight: number;
  faces: FaceLayout[];
  /** Footprint edges without a dock: rendered as cutaway walls. */
  cutawayFaces: Face[];
  bays: BayLayout[];
  columns: { X: number; Z: number }[];
  columnHeight: number;
  /** Site-frame bounds of footprint plus apron strips (pan limits). */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Empty unless `view.showExteriorContext`. */
  context: ContextItem[];
  /** Null unless `view.surround`. */
  surround: SurroundLayout | null;
}

export const WALL_THICKNESS = 0.35;
/** Square section of a shed column. */
export const COLUMN_SIZE = 0.34;
const ALL_FACES: readonly Face[] = ['N', 'S', 'E', 'W'];

function faceOrigin(face: Face, width: number, depth: number): DoorOrigin {
  switch (face) {
    case 'S':
      return { X: 0, Z: depth / 2 };
    case 'N':
      return { X: 0, Z: -depth / 2 };
    case 'E':
      return { X: width / 2, Z: 0 };
    case 'W':
      return { X: -width / 2, Z: 0 };
  }
}

/** Offset of door `i` of `n` along the face axis in site coordinates, honouring `bayOrder`. */
function axisOffset(order: string, i: number, n: number, pitch: number): number {
  const o = (i - (n - 1) / 2) * pitch;
  return order === 'E_TO_W' || order === 'S_TO_N' ? -o : o;
}

function clampRange(r: Range, lo: number, hi: number): Range {
  return [Math.min(Math.max(r[0], lo), hi), Math.min(Math.max(r[1], lo), hi)];
}

function buildContext(config: SiteConfig, width: number, depth: number): ContextItem[] {
  if (!config.view.showExteriorContext) return [];
  const edge = (side: Face, offset: number) => {
    switch (side) {
      case 'S':
        return { X: 0, Z: depth / 2 + offset };
      case 'N':
        return { X: 0, Z: -depth / 2 - offset };
      case 'E':
        return { X: width / 2 + offset, Z: 0 };
      case 'W':
        return { X: -width / 2 - offset, Z: 0 };
    }
  };
  return config.context.map((c): ContextItem => {
    const alongX = c.side === 'N' || c.side === 'S';
    if (c.type === 'road') {
      return {
        type: 'road',
        center: edge(c.side, c.offset),
        size: alongX ? [width * 3, 3.5 * c.lanes] : [3.5 * c.lanes, depth * 3],
      };
    }
    if (c.type === 'building') {
      const [sx, sz, sh] = c.size;
      return { type: 'building', center: edge(c.side, c.offset + sz / 2), size: [sx, sh, sz] };
    }
    const base = edge(c.side, 8);
    return {
      type: 'trees',
      positions: Array.from({ length: c.count }, (_, i) => ({
        X: base.X + (alongX ? (i / c.count - 0.5) * width * 1.6 : (i % 4) * 3),
        Z: base.Z + (alongX ? (i % 4) * 3 : (i / c.count - 0.5) * depth * 1.6),
      })),
    };
  });
}

const DASH = 3;
const DASH_GAP = 4;
/** Share of the tree slots left empty, so the rows read as planted, not ruled. */
const TREE_GAPS = 0.22;

/**
 * Ring road around `bounds` (footprint + apron), so nothing built stands on it. Trees stand beyond the road, or on its
 * inner verge on the `treesInside` sides: the sides beyond the shed in the hero view, where a tree leans away from the
 * floor on screen and would otherwise land behind the KPI row.
 */
function buildSurround(config: SiteConfig, bounds: SiteLayout['bounds']): SurroundLayout | null {
  const s = config.view.surround;
  if (!s) return null;
  const grow = s.clearance + s.roadWidth;
  const width = bounds.maxX - bounds.minX + 2 * grow;
  const depth = bounds.maxZ - bounds.minZ + 2 * grow;
  const center = { X: (bounds.minX + bounds.maxX) / 2, Z: (bounds.minZ + bounds.maxZ) / 2 };
  const radius = Math.min(s.cornerRadius, width / 2, depth / 2);
  const dashes: SurroundLayout['dashes'] = [];
  const trees: SurroundTree[] = [];
  const r = rng(hashString(`${config.id}-surround`));
  // one straight per side: `along` runs over its length, `across` is fixed
  for (const alongX of [true, false]) {
    const len = (alongX ? width : depth) - 2 * radius;
    const half = (alongX ? depth : width) / 2;
    for (const sign of [-1, 1]) {
      const side: Face = alongX ? (sign < 0 ? 'N' : 'S') : sign < 0 ? 'W' : 'E';
      const inside = s.treesInside.includes(side);
      const at = (along: number, across: number) =>
        alongX
          ? { X: center.X + along, Z: center.Z + sign * across }
          : { X: center.X + sign * across, Z: center.Z + along };
      for (let a = -len / 2; a + DASH <= len / 2; a += DASH + DASH_GAP) {
        dashes.push({ ...at(a + DASH / 2, half - s.roadWidth / 2), alongX, length: DASH });
      }
      for (let a = -len / 2 + s.treeSpacing / 2; a < len / 2; a += s.treeSpacing) {
        const jitter = (r() - 0.5) * s.treeSpacing * 0.4;
        const setback = s.treeSetback + r() * 2;
        const across = inside ? half - s.roadWidth - setback : half + setback;
        const height = 4.6 + r() * 1.8;
        const crown = 1.5 + r() * 0.6;
        if (r() < TREE_GAPS) continue;
        trees.push({ ...at(a + jitter, across), height, crown });
      }
    }
  }
  return { center, width, depth, road: s.roadWidth, radius, dashes, trees };
}

export function buildSiteLayout(config: SiteConfig): SiteLayout {
  const { widthEW: width, depthNS: depth } = config.building.footprint;
  const floorLevel = config.building.floorLevel;
  const view = config.view;
  const bi = config.bayInterior;

  const faces: FaceLayout[] = config.dockFaces.map((df) => {
    const origin = faceOrigin(df.face, width, depth);
    const yaw = faceYaw(df.face);
    const alongX = df.face === 'S' || df.face === 'N';
    const length = alongX ? width : depth;
    const interior = alongX ? depth : width;
    const maxY = interior - WALL_THICKNESS - 0.5;
    const n = df.bays.length;

    const bays: BayLayout[] = df.bays.map((b, i) => {
      const off = axisOffset(df.bayOrder, i, n, df.doorPitch);
      const door: DoorOrigin = alongX
        ? { X: origin.X + off, Z: origin.Z }
        : { X: origin.X, Z: origin.Z + off };
      const localX = siteToBay(
        df.face,
        origin,
        { X: door.X, Y: floorLevel, Z: door.Z },
        floorLevel,
      ).x;
      const half = df.doorPitch / 2 - 0.1;
      const cx = (r: Range): Range => [Math.max(r[0], -half), Math.min(r[1], half)];
      const c = bi.conveyor;
      const fixedTo = Math.min(c.fixedTo, maxY);
      const at = (y: number): SitePoint => bayToSite(df.face, door, { x: 0, y, z: 0 }, floorLevel);
      return {
        id: b.id,
        label: b.label,
        conveyorName: b.conveyor,
        face: df.face,
        index: i,
        door,
        localX,
        yaw,
        pitch: df.doorPitch,
        zones: {
          workZone: { x: cx(bi.workZone.x), y: clampRange(bi.workZone.y, 0, maxY) },
          staging: { x: cx(bi.staging.x), y: clampRange(bi.staging.y, 0, maxY) },
          aisle: clampRange(bi.forkliftAisle.y, 0, maxY),
          storage: clampRange(bi.storage.y, 0, maxY),
        },
        cameras: config.cameraTemplate.map((cam): CameraMount => ({
          id: `${b.id}-${cam.role}`,
          role: cam.role,
          looks: cam.looks,
          mount: cam.mount,
          at: bayToSite(df.face, door, cam.mount, floorLevel),
        })),
        conveyor: {
          fixedFrom: c.fixedFrom,
          fixedTo,
          boomMaxReach: c.boomMaxReach,
          width: c.width,
          start: at(c.fixedFrom),
          end: at(fixedTo),
        },
      };
    });

    // Holding slots: parallel to the wall along the far edge of the apron strip.
    const slotLen = 9.5;
    const slotDepth = 3.4;
    const slotCount = Math.min(
      config.yard.holdingLane.slots,
      Math.max(0, Math.floor(length / (slotLen + 0.6))),
    );
    const slots: HoldingSlot[] = Array.from({ length: slotCount }, (_, i) => ({
      x: (i - (slotCount - 1) / 2) * (slotLen + 0.8),
      y: -(view.apronDepth - slotDepth / 2 - 0.4),
      w: slotLen,
      d: slotDepth,
    }));

    return {
      face: df.face,
      origin,
      yaw,
      length,
      depth: interior,
      pitch: df.doorPitch,
      door: df.door,
      bays,
      apron: {
        depth: view.apronDepth,
        length,
        guideLineLength: Math.min(
          config.yard.guideLineLength,
          Math.max(0, view.apronDepth - slotDepth - 1),
        ),
        slots,
      },
    };
  });

  const dockSet = new Set(faces.map((f) => f.face));
  const cutawayFaces = ALL_FACES.filter((f) => !dockSet.has(f));

  // Column grid: centred on the footprint, snapped to bay boundaries along every dock face so no column
  // lands in a doorway or on a conveyor.
  const gridPositions = (len: number, g: number) => {
    const n = Math.max(0, Math.floor(len / g));
    return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * g);
  };
  const snapAxis = (axis: 'X' | 'Z', v: number): number => {
    let best = v;
    let bestD = Infinity;
    for (const f of faces) {
      if ((axis === 'X') !== (f.face === 'S' || f.face === 'N')) continue;
      const offs = f.bays.map((b) => (axis === 'X' ? b.door.X : b.door.Z)).sort((a, b) => a - b);
      const bounds = offs.map((o) => o - f.pitch / 2);
      if (offs.length > 0) bounds.push((offs[offs.length - 1] ?? 0) + f.pitch / 2);
      for (const b of bounds) {
        if (Math.abs(b - v) < bestD) {
          bestD = Math.abs(b - v);
          best = b;
        }
      }
    }
    return best;
  };
  const colSet = new Map<string, { X: number; Z: number }>();
  for (const gx of gridPositions(width, view.columnGrid)) {
    for (const gz of gridPositions(depth, view.columnGrid)) {
      const X = snapAxis('X', gx);
      const Z = snapAxis('Z', gz);
      if (Math.abs(X) > width / 2 - 0.6 || Math.abs(Z) > depth / 2 - 0.6) continue;
      colSet.set(`${X.toFixed(3)},${Z.toFixed(3)}`, { X, Z });
    }
  }

  let minX = -width / 2;
  let maxX = width / 2;
  let minZ = -depth / 2;
  let maxZ = depth / 2;
  for (const f of faces) {
    const a = view.apronDepth;
    if (f.face === 'S') maxZ = Math.max(maxZ, depth / 2 + a);
    if (f.face === 'N') minZ = Math.min(minZ, -depth / 2 - a);
    if (f.face === 'E') maxX = Math.max(maxX, width / 2 + a);
    if (f.face === 'W') minX = Math.min(minX, -width / 2 - a);
  }

  const bounds = { minX, maxX, minZ, maxZ };
  return {
    id: config.id,
    floorLevel,
    footprint: { width, depth },
    view,
    facade: config.building.facade,
    eaveHeight: config.building.eaveHeight,
    faces,
    cutawayFaces,
    bays: faces.flatMap((f) => f.bays),
    columns: [...colSet.values()],
    columnHeight: view.cutawayWallHeight * 1.5,
    bounds,
    context: buildContext(config, width, depth),
    surround: buildSurround(config, bounds),
  };
}
