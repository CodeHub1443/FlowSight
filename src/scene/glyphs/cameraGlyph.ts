import type { CameraStatus } from '@/domain';

// Camera glyphs (docs/04 section 5, t22 spec B6): a small camera at each configured mount. Which glyphs show, and in what
// tint, follows the camera's health. Pure and three-free.

export type GlyphTint = 'neutral' | 'warn' | 'critical';

export interface GlyphState {
  visible: boolean;
  tint: GlyphTint;
  /** Offline glyphs pulse slowly (and stay still under prefers-reduced-motion, see `pulseScale`). */
  pulse: boolean;
}

/**
 * A healthy camera shows only in X-ray mode, one that needs attention always. Obstructed, defocused and moved read as a
 * warning, offline as critical. A camera the health frame does not list (no frame yet) is taken as healthy.
 */
export function glyphState(status: CameraStatus | undefined, xray: boolean): GlyphState {
  switch (status) {
    case 'OBSTRUCTED':
    case 'DEFOCUS':
    case 'MOVED':
      return { visible: true, tint: 'warn', pulse: false };
    case 'OFFLINE':
      return { visible: true, tint: 'critical', pulse: true };
    case 'OK':
    case undefined:
      return { visible: xray, tint: 'neutral', pulse: false };
  }
}

/** Period of the offline pulse, seconds (slow). */
export const PULSE_PERIOD_S = 2.4;
/** Size swing of the pulse, as a share of the glyph size. */
export const PULSE_DEPTH = 0.18;

/** Scale of a pulsing glyph at time `seconds`: 1 +- PULSE_DEPTH, and a flat 1 under reduced motion. */
export function pulseScale(seconds: number, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  return 1 + PULSE_DEPTH * Math.sin((seconds / PULSE_PERIOD_S) * Math.PI * 2);
}

/** The pieces of an event the lookup reads. */
interface EventLike {
  id: string;
  ts: string;
  status: string;
  src: { cam: string | null };
}

/**
 * Id of the newest open event raised by camera `cam` (a click on its glyph opens it), or null. "Open" is status OPEN: an
 * acknowledged or closed event is no longer waiting for anybody.
 */
export function newestOpenEventForCamera<E extends EventLike>(
  events: Readonly<Record<string, E>>,
  cam: string,
  /** Events the session may not see (a role without the category) are skipped. */
  visible: (event: E) => boolean = () => true,
): string | null {
  let best: EventLike | null = null;
  let bestTs = -Infinity;
  for (const e of Object.values(events)) {
    if (e.status !== 'OPEN' || e.src.cam !== cam || !visible(e)) continue;
    const ts = Date.parse(e.ts);
    if (ts > bestTs || (ts === bestTs && best !== null && e.id > best.id)) {
      best = e;
      bestTs = ts;
    }
  }
  return best ? best.id : null;
}

/** Direction (bay frame: x right, y into the building, z up) a camera looks, from the `looks` word of the config. */
export function lookDirection(looks: string): readonly [number, number, number] {
  switch (looks) {
    case 'down':
      return [0, 0, -1];
    case 'door':
    case 'yard':
      return [0, -1, 0];
    default:
      return [0, -1, 0];
  }
}

/** The state of every camera glyph, shared by the drawing (CameraGlyphs) and the picking (ActorInteraction). */
export class GlyphBoard {
  readonly states = new Map<string, GlyphState>();
  /** Bumped whenever a state changes, so a drawer rewrites its buffers only then. */
  version = 0;

  /** Recompute every state; returns true when anything changed. */
  update(
    ids: readonly string[],
    statusOf: (cam: string) => CameraStatus | undefined,
    xray: boolean,
  ): boolean {
    let changed = false;
    for (const id of ids) {
      const next = glyphState(statusOf(id), xray);
      const prev = this.states.get(id);
      if (
        !prev ||
        prev.visible !== next.visible ||
        prev.tint !== next.tint ||
        prev.pulse !== next.pulse
      ) {
        this.states.set(id, next);
        changed = true;
      }
    }
    if (changed) this.version++;
    return changed;
  }

  isVisible(cam: string): boolean {
    return this.states.get(cam)?.visible === true;
  }
}
