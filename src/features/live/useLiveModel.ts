import { useMemo, useSyncExternalStore } from 'react';
import type { Actor, ActorsFrame } from '@/domain';
import {
  clockNow,
  subscribeClock,
  useBays,
  useLiveStore,
  useSessionStore,
  useUiStore,
} from '@/stores';
import { activeVisits, resolveVisit, type ActiveVisit } from './model';

const noWall = () => 0;

/**
 * "Now" for dwell clocks and ages: the newest message timestamp (so replay and mock streams read consistently),
 * falling back to the wall clock (1 Hz, shared clock) before the first message. Once messages flow, the wall clock
 * snapshot is constant, so the 1 Hz tick does not re-render on top of the 4 Hz store flushes (docs/06 §4).
 */
export function useStreamNow(): number {
  const lastTs = useLiveStore((s) => s.lastTs);
  const wallSnapshot = lastTs === null ? clockNow : noWall;
  const wall = useSyncExternalStore(subscribeClock, wallSnapshot, wallSnapshot);
  return lastTs ?? wall;
}

export function useActiveVisits(): ActiveVisit[] {
  const bays = useBays();
  return useMemo(() => activeVisits(bays), [bays]);
}

/** The visit the tracker (and truck inspector) refers to for the current selection. */
export function useSelectedVisit(): ActiveVisit | null {
  const bays = useBays();
  const visits = useLiveStore((s) => s.visits);
  const selection = useUiStore((s) => s.selection);
  return useMemo(() => resolveVisit(selection, bays, visits), [selection, bays, visits]);
}

export function useRole() {
  return useSessionStore((s) => s.role);
}

/** Find an actor by track id across all bays (ids repeat across bays in fixture data: first bay wins). */
export function findActor(
  actors: Readonly<Record<string, ActorsFrame>>,
  id: string,
): { bay: string; actor: Actor } | null {
  for (const [bay, frame] of Object.entries(actors).sort(([a], [b]) => a.localeCompare(b))) {
    const actor = frame.actors.find((a) => a.id === id);
    if (actor) return { bay, actor };
  }
  return null;
}
