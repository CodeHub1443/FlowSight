import type { ActorsFrame, BayState, WhEventWithStatus } from '@/domain';
import { findActor } from '@/features/live/useLiveModel';
import type { FlyTarget } from '@/scene/camera/cameraController';
import type { CameraTarget, Selection, VisitRecord } from '@/stores';

// Maps a uiStore selection / camera target onto what the scene understands: a bay id or a camera preset.
// Pure: the caller passes current store snapshots.

export interface SceneTargetContext {
  /** Bay ids the scene knows (from the site config). */
  bayIds: ReadonlySet<string>;
  bays: Readonly<Record<string, BayState>>;
  visits: Readonly<Record<string, VisitRecord>>;
  actors: Readonly<Record<string, ActorsFrame>>;
  events: Readonly<Record<string, WhEventWithStatus>>;
}

/** The bay a selection belongs to, or null when it has none (site, unknown ids, events without a bay). */
export function bayOfSelection(sel: Selection, ctx: SceneTargetContext): string | null {
  const known = (bayId: string | null | undefined) =>
    bayId && ctx.bayIds.has(bayId) ? bayId : null;
  switch (sel.kind) {
    case 'bay':
    case 'belt':
    case 'staging':
      return known(sel.id);
    case 'truck':
      return known(
        ctx.visits[sel.id]?.bay ??
          Object.values(ctx.bays).find((b) => b.visit?.visitId === sel.id)?.bay,
      );
    case 'person':
    case 'forklift':
      return known(findActor(ctx.actors, sel.id)?.bay);
    case 'event':
      return known(ctx.events[sel.id]?.bay);
    case 'site':
      return null;
  }
}

/** Where the camera should fly for a uiStore camera target; null = do nothing. */
export function flyTargetFor(target: CameraTarget, ctx: SceneTargetContext): FlyTarget | null {
  if (target.kind === 'home' || target.kind === 'site') return 'floorOverview';
  if (target.id === null) return null;
  return bayOfSelection({ kind: target.kind, id: target.id }, ctx);
}
