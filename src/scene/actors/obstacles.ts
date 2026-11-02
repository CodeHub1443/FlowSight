import type { Actor, ActorAct } from '@/domain';
import {
  cabinetItems,
  conveyorBodyItems,
  conveyorFrame,
  conveyorSupportItems,
} from '../bay/bayItems';
import { buildStaging, stagingInput } from '../bay/stagingLayout';
import { buildStorage, storageInput, storageProps } from '../bay/storageLayout';
import { CRATE_TONES, type PaletteKey } from '../materials';
import { COLUMN_SIZE, type BayLayout, type SiteLayout } from '../site/layout';
import { siteToBay } from '../site/transforms';

// Keeps people and forklifts out of what stands on the floor, at render time (docs/04 section 4). Positions come from the
// data and are drawn where the data says, but a stack is scenery: the real crew camera will put people next to one, or a
// little inside. The data and the stores stay as they are; only the drawn pose moves. Pure and three-free, no allocation
// per call. The rectangles come from the layout functions that place the props, so they cannot drift from the scene.

export type ObstacleKind =
  'pallet' | 'crate' | 'jack' | 'conveyor' | 'motor' | 'cabinet' | 'storage' | 'column';

/** An axis-aligned floor footprint in the bay frame. Yawed props get the bounds of their yawed footprint. */
export interface ObstacleRect {
  kind: ObstacleKind;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A standing or walking person's half width (shoulders and arms, actorRig) plus a small margin. */
export const PERSON_CLEARANCE = 0.45;
/** Someone handling or carrying works at the edge of a stack: arms may reach over it, the body stays out. */
export const AT_EDGE_CLEARANCE = 0.36;
/** A forklift's half width and its reach along its heading from its origin, forks and carried pallet included. */
export const FORKLIFT_HALF_WIDTH = 0.8;
export const FORKLIFT_REACH = 2.05;

/** Rects per grid cell stay few at this size: the smallest gap a person fits through is about this wide. */
const CELL_M = 0.5;
/** Rects a push may chain through: from inside one stack, past whatever touches it. */
const MAX_DEPTH = 6;
/** Past the far edge, not on it. */
const EPS = 1e-3;
/**
 * Weight of the distance from where the figure is now, when choosing where to push it to. Without it a track wobbling
 * around the middle of a stack would cross the stack at every frame; with it the figure stays on its side until the data
 * is clearly past the middle.
 */
const STICKY = 0.25;

function footprint(
  kind: ObstacleKind,
  at: readonly number[],
  size: readonly number[],
  yaw = 0,
): ObstacleRect {
  const [x = 0, y = 0] = at;
  const [w = 0, d = 0] = size;
  const c = Math.abs(Math.cos(yaw));
  const s = Math.abs(Math.sin(yaw));
  const rx = (w * c + d * s) / 2;
  const ry = (w * s + d * c) / 2;
  return { kind, x0: x - rx, y0: y - ry, x1: x + rx, y1: y + ry };
}

function union(kind: ObstacleKind, rects: readonly ObstacleRect[]): ObstacleRect | null {
  const first = rects[0];
  if (!first) return null;
  const out = { ...first, kind };
  for (const r of rects) {
    out.x0 = Math.min(out.x0, r.x0);
    out.y0 = Math.min(out.y0, r.y0);
    out.x1 = Math.max(out.x1, r.x1);
    out.y1 = Math.max(out.y1, r.y1);
  }
  return out;
}

/** One rect per stack, however many levels it has. */
function perStack(kind: ObstacleKind, rects: readonly ObstacleRect[]): ObstacleRect[] {
  const stacks = new Map<string, ObstacleRect[]>();
  for (const r of rects) {
    const key = `${((r.x0 + r.x1) / 2).toFixed(2)},${((r.y0 + r.y1) / 2).toFixed(2)}`;
    const list = stacks.get(key);
    if (list) list.push(r);
    else stacks.set(key, [r]);
  }
  return [...stacks.values()].flatMap((list) => union(kind, list) ?? []);
}

const CRATES: ReadonlySet<PaletteKey> = new Set(CRATE_TONES);

/** Everything that stands on this bay's floor, in its own frame, from the functions that place it. */
export function bayObstacles(bay: BayLayout): ObstacleRect[] {
  const c = bay.conveyor;
  const staging = buildStaging(stagingInput(bay));
  const out: ObstacleRect[] = [
    ...perStack(
      'pallet',
      staging.pallets.map((p) => footprint('pallet', p.at, p.size, p.yaw)),
    ),
    ...perStack(
      'crate',
      staging.boxes
        .filter((b) => CRATES.has(b.tone))
        .map((b) => footprint('crate', b.at, b.size, b.yaw)),
    ),
    ...staging.jacks.map((j) => footprint('jack', j.at, j.size, j.yaw)),
    ...storageProps(buildStorage(storageInput(bay))).pallets.map((p) =>
      footprint('storage', [p.at[0] - bay.localX, p.at[1]], p.size),
    ),
  ];
  // the conveyor's frame is tilted by about 2 degrees: its length along the floor is its length along the belt
  const y0 = conveyorFrame(c).at[1];
  const body = union(
    'conveyor',
    conveyorBodyItems(c).map((b) => footprint('conveyor', [b.at[0], y0 + b.at[1]], b.size)),
  );
  if (body) out.push(body);
  const support = conveyorSupportItems(c);
  const motor = union(
    'motor',
    support.filter((b) => b.tone === 'motor').map((b) => footprint('motor', b.at, b.size)),
  );
  if (motor) out.push(motor);
  // the two cabinets stand too close together for anyone to fit between them
  const cabinets = union(
    'cabinet',
    cabinetItems(c).map((b) => footprint('cabinet', b.at, b.size)),
  );
  if (cabinets) out.push(cabinets);
  return out;
}

/** Shed columns in this bay's frame, out to one pitch beyond it on either side. */
function columnsNear(layout: SiteLayout, bay: BayLayout): ObstacleRect[] {
  const out: ObstacleRect[] = [];
  for (const col of layout.columns) {
    const p = siteToBay(
      bay.face,
      bay.door,
      { X: col.X, Y: layout.floorLevel, Z: col.Z },
      layout.floorLevel,
    );
    if (Math.abs(p.x) > bay.pitch * 1.5) continue;
    out.push(footprint('column', [p.x, p.y], [COLUMN_SIZE, COLUMN_SIZE]));
  }
  return out;
}

/** Rects near one bay, in its frame, with a fixed-size bucket grid over them. */
class BayGrid {
  readonly x0: Float64Array;
  readonly y0: Float64Array;
  readonly x1: Float64Array;
  readonly y1: Float64Array;
  private readonly minX: number;
  private readonly minY: number;
  private readonly nx: number;
  private readonly ny: number;
  /** Compressed rows: the rects of cell i are items[start[i]] up to items[start[i + 1]]. */
  private readonly start: Int32Array;
  private readonly items: Int32Array;

  constructor(rects: readonly ObstacleRect[], reach: number) {
    const n = rects.length;
    this.x0 = new Float64Array(n);
    this.y0 = new Float64Array(n);
    this.x1 = new Float64Array(n);
    this.y1 = new Float64Array(n);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    rects.forEach((r, i) => {
      this.x0[i] = r.x0;
      this.y0[i] = r.y0;
      this.x1[i] = r.x1;
      this.y1[i] = r.y1;
      minX = Math.min(minX, r.x0 - reach);
      minY = Math.min(minY, r.y0 - reach);
      maxX = Math.max(maxX, r.x1 + reach);
      maxY = Math.max(maxY, r.y1 + reach);
    });
    this.minX = n ? minX : 0;
    this.minY = n ? minY : 0;
    this.nx = n ? Math.max(1, Math.ceil((maxX - minX) / CELL_M)) : 0;
    this.ny = n ? Math.max(1, Math.ceil((maxY - minY) / CELL_M)) : 0;
    const cells: number[][] = Array.from({ length: this.nx * this.ny }, () => []);
    rects.forEach((r, i) => {
      const cx0 = Math.floor((r.x0 - reach - this.minX) / CELL_M);
      const cx1 = Math.min(this.nx - 1, Math.floor((r.x1 + reach - this.minX) / CELL_M));
      const cy0 = Math.floor((r.y0 - reach - this.minY) / CELL_M);
      const cy1 = Math.min(this.ny - 1, Math.floor((r.y1 + reach - this.minY) / CELL_M));
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) cells[cy * this.nx + cx]?.push(i);
      }
    });
    this.start = new Int32Array(cells.length + 1);
    cells.forEach((list, i) => {
      this.start[i + 1] = (this.start[i] ?? 0) + list.length;
    });
    this.items = new Int32Array(cells.flat());
  }

  /** The first rect grown by `c` that holds the point, or -1. */
  hit(x: number, y: number, c: number): number {
    const cx = Math.floor((x - this.minX) / CELL_M);
    const cy = Math.floor((y - this.minY) / CELL_M);
    if (cx < 0 || cy < 0 || cx >= this.nx || cy >= this.ny) return -1;
    const cell = cy * this.nx + cx;
    const end = this.start[cell + 1] as number;
    for (let k = this.start[cell] as number; k < end; k++) {
      const i = this.items[k] as number;
      if (
        x > (this.x0[i] as number) - c &&
        x < (this.x1[i] as number) + c &&
        y > (this.y0[i] as number) - c &&
        y < (this.y1[i] as number) + c
      ) {
        return i;
      }
    }
    return -1;
  }
}

interface BayField {
  grid: BayGrid;
  /** Near the aisle only: what a forklift can meet. */
  aisleColumns: readonly ObstacleRect[];
  aisle: readonly [number, number];
}

/** How far a person is kept from an obstacle while doing `act`. */
export function clearanceFor(act: ActorAct): number {
  return act === 'HANDLING' || act === 'CARRYING' ? AT_EDGE_CLEARANCE : PERSON_CLEARANCE;
}

/** Half extents along bay x and y of a forklift at heading `h`. Heading 0 faces bay +y. */
function forkliftExtents(h: number): { hx: number; hy: number } {
  const c = Math.abs(Math.cos(h));
  const s = Math.abs(Math.sin(h));
  return {
    hx: s * FORKLIFT_REACH + c * FORKLIFT_HALF_WIDTH,
    hy: c * FORKLIFT_REACH + s * FORKLIFT_HALF_WIDTH,
  };
}

/** What the actor tracks need; tests may stand in for it. */
export interface PoseResolver {
  /** Result of the last resolve(), in the bay frame. */
  outX: number;
  outY: number;
  resolve(
    bay: string,
    actor: Pick<Actor, 'kind' | 'act' | 'h'>,
    x: number,
    y: number,
    /** Where the figure is drawn now. */
    prevX: number,
    prevY: number,
  ): void;
}

export class ObstacleField implements PoseResolver {
  outX = 0;
  outY = 0;
  private readonly bays = new Map<string, BayField>();
  // the search's state, kept here so a call allocates nothing
  private grid: BayGrid | null = null;
  private fromX = 0;
  private fromY = 0;
  private prevX = 0;
  private prevY = 0;
  private bestCost = Infinity;
  private bestX = 0;
  private bestY = 0;

  constructor(layout: SiteLayout) {
    const own = new Map(layout.bays.map((b) => [b.id, bayObstacles(b)]));
    for (const face of layout.faces) {
      for (const bay of face.bays) {
        // a person's position may lie over the line in the next bay's floor: that bay's stacks count too
        const rects = face.bays.flatMap((other) => {
          const dx = other.localX - bay.localX;
          if (Math.abs(dx) > bay.pitch * 1.5) return [];
          return (own.get(other.id) ?? []).map((r) => ({
            ...r,
            x0: r.x0 + dx,
            x1: r.x1 + dx,
          }));
        });
        const columns = columnsNear(layout, bay);
        const [a0, a1] = bay.zones.aisle;
        this.bays.set(bay.id, {
          grid: new BayGrid([...rects, ...columns], PERSON_CLEARANCE),
          aisleColumns: columns.filter((r) => r.y1 > a0 && r.y0 < a1),
          aisle: bay.zones.aisle,
        });
      }
    }
  }

  resolve(
    bay: string,
    actor: Pick<Actor, 'kind' | 'act' | 'h'>,
    x: number,
    y: number,
    prevX: number,
    prevY: number,
  ): void {
    this.outX = x;
    this.outY = y;
    const field = this.bays.get(bay);
    if (!field) return;
    if (actor.kind === 'FORKLIFT') this.resolveForklift(field, actor.h, x, y);
    else this.resolvePerson(field.grid, clearanceFor(actor.act), x, y, prevX, prevY);
  }

  /** Whether a point is inside a rect grown by `clearance`: the figure's body would be in the prop. */
  isInside(bay: string, x: number, y: number, clearance: number): boolean {
    return (this.bays.get(bay)?.grid.hit(x, y, clearance) ?? -1) >= 0;
  }

  /** The nearest free point, or the point itself where the search finds none (nothing the layout can produce). */
  private resolvePerson(
    grid: BayGrid,
    c: number,
    x: number,
    y: number,
    prevX: number,
    prevY: number,
  ): void {
    if (grid.hit(x, y, c) < 0) return;
    this.grid = grid;
    this.fromX = x;
    this.fromY = y;
    this.prevX = prevX;
    this.prevY = prevY;
    this.bestCost = Infinity;
    // deepening: the first way out bounds the search for a better one, one rect further
    for (let depth = 1; depth <= MAX_DEPTH; depth++) {
      const found = this.bestCost < Infinity;
      this.search(x, y, c, depth);
      if (found) break;
    }
    if (this.bestCost < Infinity) {
      this.outX = this.bestX;
      this.outY = this.bestY;
    }
  }

  /** Out of the rect that holds the point, by each of its four sides, nearest first; on through whatever is there. */
  private search(x: number, y: number, c: number, depth: number): void {
    const grid = this.grid as BayGrid;
    const pushed = Math.hypot(x - this.fromX, y - this.fromY);
    if (pushed >= this.bestCost) return;
    const i = grid.hit(x, y, c);
    if (i < 0) {
      const cost = pushed + STICKY * Math.hypot(x - this.prevX, y - this.prevY);
      if (cost < this.bestCost) {
        this.bestCost = cost;
        this.bestX = x;
        this.bestY = y;
      }
      return;
    }
    if (depth === 0) return;
    const left = (grid.x0[i] as number) - c - EPS;
    const right = (grid.x1[i] as number) + c + EPS;
    const down = (grid.y0[i] as number) - c - EPS;
    const up = (grid.y1[i] as number) + c + EPS;
    let tried = 0;
    for (let n = 0; n < 4; n++) {
      let side = -1;
      let least = Infinity;
      if (!(tried & 1) && x - left < least) {
        least = x - left;
        side = 0;
      }
      if (!(tried & 2) && right - x < least) {
        least = right - x;
        side = 1;
      }
      if (!(tried & 4) && y - down < least) {
        least = y - down;
        side = 2;
      }
      if (!(tried & 8) && up - y < least) side = 3;
      tried |= 1 << side;
      if (side === 0) this.search(left, y, c, depth - 1);
      else if (side === 1) this.search(right, y, c, depth - 1);
      else if (side === 2) this.search(x, down, c, depth - 1);
      else this.search(x, up, c, depth - 1);
    }
  }

  /** Kept within the aisle's width; along it, stopped short of a column. A carried pallet is within the same extents. */
  private resolveForklift(field: BayField, h: number, x: number, y: number): void {
    const { hx, hy } = forkliftExtents(h);
    const [a0, a1] = field.aisle;
    const low = a0 + hy;
    const high = a1 - hy;
    const ay = high >= low ? Math.min(high, Math.max(low, y)) : (a0 + a1) / 2;
    let ax = x;
    for (const r of field.aisleColumns) {
      if (ay + hy <= r.y0 || ay - hy >= r.y1) continue;
      if (ax > r.x0 - hx && ax < r.x1 + hx) {
        ax = ax < (r.x0 + r.x1) / 2 ? r.x0 - hx - EPS : r.x1 + hx + EPS;
      }
    }
    this.outX = ax;
    this.outY = ay;
  }
}
