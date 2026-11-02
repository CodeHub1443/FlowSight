import type { Actor, ActorsFrame } from '@/domain';
import { hashString } from '../site/random';
import type { PoseResolver } from './obstacles';

// People and forklifts between frames (docs/04 section 4, docs/02 section 6 rule 2): 2 Hz in, one pose per rendered
// frame out. Pure and three-free. All timing is local receive time, so simulator speed cannot change the look of a move.

/** An actor absent from every frame for this long fades out (docs/04 section 4). */
export const UNSEEN_MS = 5000;
export const FADE_OUT_MS = 500;
export const FADE_IN_MS = 200;
/** Bounds on the time one interpolation leg takes: a burst must not snap, a gap must not crawl. */
export const MIN_LEG_MS = 120;
export const MAX_LEG_MS = 1000;
/** A longer step than this is a new track or a restart, not movement: it snaps. */
export const TELEPORT_M = 8;
/** Most actors drawn per bay (10 people + 1 forklift would already exceed the crowding limit of 8). */
export const MAX_PEOPLE_PER_BAY = 10;
export const MAX_FORKLIFTS_PER_BAY = 1;
/** Smoothing time of a push out of an obstacle: it has settled after about three of these, some 150 ms. */
export const PUSH_SMOOTH_S = 0.05;
/** Metres per second a push may move at: a figure crossing a whole stack takes a little longer than the 150 ms. */
export const PUSH_MAX_SPEED = 11;

export interface ActorTrack {
  id: string;
  bay: string;
  actor: Actor;
  /** Stable per id: offsets the animation so a crew does not move in step. */
  seed: number;
  fromX: number;
  fromY: number;
  fromH: number;
  legStart: number;
  legMs: number;
  firstSeen: number;
  lastSeen: number;
  /** Interpolated pose and opacity (0..1) after the last update(). */
  x: number;
  y: number;
  h: number;
  fade: number;
  /** Metres moved at the last update, per second: drives the walk cycle. */
  speed: number;
  /** The drawn pose minus the data's, while an obstacle holds the figure off (obstacles.ts), and how fast it changes. */
  pushX: number;
  pushY: number;
  pushVX: number;
  pushVY: number;
  /** The next update places the figure at once: it is new, or was just teleported. */
  snap: boolean;
}

/** One axis of a critically damped follow: no jump when the target jumps, however far. Leaves its velocity in `follow`. */
const follow = { v: 0 };
function followTo(value: number, target: number, velocity: number, dt: number): number {
  const omega = 2 / PUSH_SMOOTH_S;
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const most = PUSH_MAX_SPEED * PUSH_SMOOTH_S;
  const change = Math.max(-most, Math.min(most, value - target));
  const near = value - change;
  const temp = (velocity + omega * change) * dt;
  follow.v = (velocity - omega * temp) * decay;
  return near + (change + temp) * decay;
}

/** `a` to `b` along the shorter way round, in the contract's (-pi, pi] range. */
export function lerpAngle(a: number, b: number, k: number): number {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  let r = a + d * k;
  if (r > Math.PI) r -= 2 * Math.PI;
  if (r <= -Math.PI) r += 2 * Math.PI;
  return r;
}

export function fadeAt(firstSeen: number, lastSeen: number, now: number): number {
  const fadeIn = Math.min(1, (now - firstSeen) / FADE_IN_MS);
  const fadeOut = 1 - (now - lastSeen - UNSEEN_MS) / FADE_OUT_MS;
  return Math.max(0, Math.min(fadeIn, fadeOut, 1));
}

/** The actors a frame may draw: the first `MAX_*_PER_BAY` of each kind, in the order they were sent. */
export function capActors(actors: readonly Actor[]): Actor[] {
  let people = 0;
  let lifts = 0;
  return actors.filter((a) =>
    a.kind === 'PERSON' ? ++people <= MAX_PEOPLE_PER_BAY : ++lifts <= MAX_FORKLIFTS_PER_BAY,
  );
}

export class ActorTracks {
  constructor(private readonly resolver?: PoseResolver) {}

  readonly tracks = new Map<string, ActorTrack>();
  private readonly lastFrameAt = new Map<string, number>();
  /** Bumped whenever a frame arrives or a track is removed. */
  seq = 0;

  applyFrame(frame: ActorsFrame, now: number): void {
    const prev = this.lastFrameAt.get(frame.bay);
    this.lastFrameAt.set(frame.bay, now);
    const legMs = Math.min(MAX_LEG_MS, Math.max(MIN_LEG_MS, prev === undefined ? 500 : now - prev));
    for (const actor of capActors(frame.actors)) {
      const t = this.tracks.get(actor.id);
      if (!t) {
        this.tracks.set(actor.id, {
          id: actor.id,
          bay: frame.bay,
          actor,
          seed: hashString(actor.id),
          fromX: actor.x,
          fromY: actor.y,
          fromH: actor.h,
          legStart: now,
          legMs,
          firstSeen: now,
          lastSeen: now,
          x: actor.x,
          y: actor.y,
          h: actor.h,
          fade: 0,
          speed: 0,
          pushX: 0,
          pushY: 0,
          pushVX: 0,
          pushVY: 0,
          snap: true,
        });
        continue;
      }
      const jump = Math.hypot(actor.x - t.x, actor.y - t.y) > TELEPORT_M || t.bay !== frame.bay;
      t.fromX = jump ? actor.x : t.x;
      t.fromY = jump ? actor.y : t.y;
      t.fromH = jump ? actor.h : t.h;
      // the leg starts from where the figure is drawn, so the push is part of the path now and starts over from nothing
      t.pushX = 0;
      t.pushY = 0;
      if (jump) t.snap = true;
      t.legStart = now;
      t.legMs = legMs;
      t.bay = frame.bay;
      t.actor = actor;
      // an actor back from a fade fades in again
      if (now - t.lastSeen > UNSEEN_MS) t.firstSeen = now;
      t.lastSeen = now;
    }
    this.seq++;
  }

  /** Advance every pose to `now`. `animate` false (Low tier) places each actor on its latest frame, with no fades. */
  update(now: number, dtMs: number, animate: boolean): void {
    for (const [id, t] of this.tracks) {
      const fade = fadeAt(t.firstSeen, t.lastSeen, now);
      if (now > t.lastSeen + UNSEEN_MS && fade <= 0) {
        this.tracks.delete(id);
        this.seq++;
        continue;
      }
      // Low redraws only when a frame arrives, so it must never catch an actor part-way through a fade
      t.fade = animate ? fade : 1;
      const k = animate ? Math.min(1, (now - t.legStart) / t.legMs) : 1;
      let x = t.fromX + (t.actor.x - t.fromX) * k;
      let y = t.fromY + (t.actor.y - t.fromY) * k;
      const resolver = this.resolver;
      if (resolver) {
        resolver.resolve(t.bay, t.actor, x, y, t.snap ? x : t.x, t.snap ? y : t.y);
        const wantX = resolver.outX - x;
        const wantY = resolver.outY - y;
        if (t.snap || !animate) {
          t.pushX = wantX;
          t.pushY = wantY;
          t.pushVX = 0;
          t.pushVY = 0;
        } else if (dtMs > 0) {
          const dt = dtMs / 1000;
          t.pushX = followTo(t.pushX, wantX, t.pushVX, dt);
          t.pushVX = follow.v;
          t.pushY = followTo(t.pushY, wantY, t.pushVY, dt);
          t.pushVY = follow.v;
        }
        x += t.pushX;
        y += t.pushY;
      }
      t.snap = false;
      t.speed = dtMs > 0 ? (Math.hypot(x - t.x, y - t.y) * 1000) / dtMs : 0;
      t.x = x;
      t.y = y;
      t.h = lerpAngle(t.fromH, t.actor.h, k);
    }
  }
}

/** docs/04 section 4: amber ring at the feet on a known violation; `null` (not evaluated) shows nothing. */
export function showsPpeRing(actor: Pick<Actor, 'kind' | 'ppeOk'>): boolean {
  return actor.kind === 'PERSON' && actor.ppeOk === false;
}

/** Whether a forklift has a pallet on its forks (docs/04 section 4). */
export function carriesPallet(actor: Pick<Actor, 'kind' | 'act'>): boolean {
  return actor.kind === 'FORKLIFT' && actor.act === 'CARRYING';
}
