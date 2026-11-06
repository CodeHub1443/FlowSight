import type { ActorTrack } from './tracks';

// Crew figures that the camera model reports on top of each other are drawn a little apart (t22 spec B7): a minimum centre
// distance of 0.55 m, never further than 0.6 m from the reported place, visual only (the data, the interpolation and the
// obstacle push are untouched; the offset is added when the figure is drawn and picked). One spatial hash per bay, a few
// relaxation passes, no allocation per frame. Deterministic: the same positions give the same offsets, in any order of
// bays, and a pair that stands exactly on one spot is split along a direction taken from the two track seeds.

/** Least centre distance between two drawn figures, metres. */
export const MIN_SEPARATION_M = 0.55;
/** Most a figure is drawn away from its reported place, metres. */
export const MAX_DISPLACEMENT_M = 0.6;
const PASSES = 5;
/** Hash cells are as wide as the minimum distance, so a figure meets only the 3 x 3 cells around it. */
const CELL = MIN_SEPARATION_M;
const KEY_SPAN = 4096;
const KEY_ORIGIN = 2048;

const cellOf = (v: number) => Math.floor(v / CELL);
const keyOf = (cx: number, cy: number) => (cx + KEY_ORIGIN) * KEY_SPAN + (cy + KEY_ORIGIN);

/** Direction in which two figures standing on one spot part: from their seeds, so it is the same every frame. */
function splitAngle(a: number, b: number): number {
  let h = (a ^ Math.imul(b, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  return ((h % 3600) / 3600) * Math.PI * 2;
}

/** Separation of the figures of one bay. Reuses its buffers: one instance per scene, called for each bay in turn. */
export class Separator {
  /** Pairs closer than the minimum found in the first pass (tests compare it with a brute-force count). */
  firstPassOverlaps = 0;

  private cap: number;
  private head = new Map<number, number>();
  private next: Int32Array;
  private ax: Float64Array;
  private ay: Float64Array;

  constructor(capacity = 64) {
    this.cap = capacity;
    this.next = new Int32Array(capacity);
    this.ax = new Float64Array(capacity);
    this.ay = new Float64Array(capacity);
  }

  private ensure(n: number): void {
    if (n <= this.cap) return;
    this.cap = Math.max(n, this.cap * 2);
    this.next = new Int32Array(this.cap);
    this.ax = new Float64Array(this.cap);
    this.ay = new Float64Array(this.cap);
  }

  /**
   * `x`, `y`: reported positions of `n` figures of one bay; `seed`: a stable number per figure. Writes the offset to draw
   * each at into `dx`, `dy` (length at least n).
   */
  separate(
    n: number,
    x: ArrayLike<number>,
    y: ArrayLike<number>,
    seed: ArrayLike<number>,
    dx: Float64Array,
    dy: Float64Array,
  ): void {
    this.ensure(n);
    for (let i = 0; i < n; i++) {
      dx[i] = 0;
      dy[i] = 0;
    }
    if (n < 2) return;
    const { head, next, ax, ay } = this;
    const min2 = MIN_SEPARATION_M * MIN_SEPARATION_M;
    for (let pass = 0; pass < PASSES; pass++) {
      head.clear();
      for (let i = 0; i < n; i++) {
        ax[i] = 0;
        ay[i] = 0;
        const k = keyOf(
          cellOf((x[i] as number) + (dx[i] as number)),
          cellOf((y[i] as number) + (dy[i] as number)),
        );
        next[i] = head.get(k) ?? -1;
        head.set(k, i);
      }
      let overlaps = 0;
      for (let i = 0; i < n; i++) {
        const px = (x[i] as number) + (dx[i] as number);
        const py = (y[i] as number) + (dy[i] as number);
        const cx = cellOf(px);
        const cy = cellOf(py);
        for (let gx = cx - 1; gx <= cx + 1; gx++) {
          for (let gy = cy - 1; gy <= cy + 1; gy++) {
            for (let j = head.get(keyOf(gx, gy)) ?? -1; j >= 0; j = next[j] as number) {
              if (j <= i) continue;
              let ex = px - ((x[j] as number) + (dx[j] as number));
              let ey = py - ((y[j] as number) + (dy[j] as number));
              const d2 = ex * ex + ey * ey;
              if (d2 >= min2) continue;
              overlaps++;
              let d = Math.sqrt(d2);
              if (d < 1e-6) {
                const a = splitAngle(seed[i] as number, seed[j] as number);
                ex = Math.cos(a);
                ey = Math.sin(a);
                d = 0;
              } else {
                ex /= d;
                ey /= d;
              }
              const push = (MIN_SEPARATION_M - d) / 2;
              ax[i] = (ax[i] as number) + ex * push;
              ay[i] = (ay[i] as number) + ey * push;
              ax[j] = (ax[j] as number) - ex * push;
              ay[j] = (ay[j] as number) - ey * push;
            }
          }
        }
      }
      if (pass === 0) this.firstPassOverlaps = overlaps;
      if (overlaps === 0) break;
      for (let i = 0; i < n; i++) {
        let ox = (dx[i] as number) + (ax[i] as number);
        let oy = (dy[i] as number) + (ay[i] as number);
        const len = Math.hypot(ox, oy);
        if (len > MAX_DISPLACEMENT_M) {
          ox *= MAX_DISPLACEMENT_M / len;
          oy *= MAX_DISPLACEMENT_M / len;
        }
        dx[i] = ox;
        dy[i] = oy;
      }
    }
  }
}

/** Crew separation over every track of the scene, bay by bay. */
export class CrewSeparation {
  private readonly separator = new Separator();
  private readonly byBay = new Map<string, ActorTrack[]>();
  private x = new Float64Array(64);
  private y = new Float64Array(64);
  private seed = new Float64Array(64);
  private dx = new Float64Array(64);
  private dy = new Float64Array(64);

  /**
   * Set `sepX` and `sepY` of every person track. `blocked` says whether a place inside the bay is taken by a prop: an
   * offset that would put a figure there is dropped.
   */
  apply(
    tracks: ReadonlyMap<string, ActorTrack>,
    blocked?: (bay: string, x: number, y: number) => boolean,
  ): void {
    for (const list of this.byBay.values()) list.length = 0;
    for (const t of tracks.values()) {
      t.sepX = 0;
      t.sepY = 0;
      if (t.actor.kind !== 'PERSON') continue;
      let list = this.byBay.get(t.bay);
      if (!list) {
        list = [];
        this.byBay.set(t.bay, list);
      }
      list.push(t);
    }
    for (const list of this.byBay.values()) {
      const n = list.length;
      if (n < 2) continue;
      if (n > this.x.length) {
        const size = Math.max(n, this.x.length * 2);
        this.x = new Float64Array(size);
        this.y = new Float64Array(size);
        this.seed = new Float64Array(size);
        this.dx = new Float64Array(size);
        this.dy = new Float64Array(size);
      }
      for (let i = 0; i < n; i++) {
        const t = list[i] as ActorTrack;
        this.x[i] = t.x;
        this.y[i] = t.y;
        this.seed[i] = t.seed;
      }
      this.separator.separate(n, this.x, this.y, this.seed, this.dx, this.dy);
      for (let i = 0; i < n; i++) {
        const t = list[i] as ActorTrack;
        const ox = this.dx[i] as number;
        const oy = this.dy[i] as number;
        if (ox === 0 && oy === 0) continue;
        if (blocked?.(t.bay, t.x + ox, t.y + oy)) continue;
        t.sepX = ox;
        t.sepY = oy;
      }
    }
  }
}
