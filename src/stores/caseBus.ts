import type { CaseTick } from '@/domain';

// Case ticks are too frequent to keep in the store (liveStore only counts them). They pass straight through to whoever
// animates them, without React and without a store flush: the 3D belts spawn one item per tick.

type Listener = (tick: CaseTick) => void;

const listeners = new Set<Listener>();

export function publishCase(tick: CaseTick): void {
  for (const l of listeners) l(tick);
}

/** Calls `cb` for every case tick from now on. Nothing is replayed on subscribe. */
export function subscribeCases(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
