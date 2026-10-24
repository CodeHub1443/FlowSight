import type { DataSource, Unsub } from '@/data/DataSource';
import { setDropHandler } from '@/domain';
import { alertStore, type AlertStore } from './alertStore';
import { liveStore, type LiveStore } from './liveStore';

export interface WireTargets {
  live: LiveStore;
  alerts: AlertStore;
}

const DEFAULT_TARGETS: WireTargets = { live: liveStore, alerts: alertStore };

/**
 * Connects a DataSource to the stores and returns the undo. Messages reaching here are already validated by
 * the source; messages dropped at the boundary are counted through the domain drop handler.
 */
export function wireDataSource(source: DataSource, targets: WireTargets = DEFAULT_TARGETS): Unsub {
  const { live, alerts } = targets;
  const l = live.getState();
  const a = alerts.getState();

  setDropHandler((info) => live.getState().recordDrop(info.kind));
  l.setSourceStatus(source.status.get());

  const unsubs: Unsub[] = [
    source.status.subscribe((status) => live.getState().setSourceStatus(status)),
    source.onSiteState((value) => l.ingest({ kind: 'siteState', value })),
    source.onBayState((value) => l.ingest({ kind: 'bayState', value })),
    source.onActors((value) => l.ingest({ kind: 'actors', value })),
    source.onCase((value) => l.ingest({ kind: 'case', value })),
    source.onHealth((value) => l.ingest({ kind: 'health', value })),
    source.onEvent((value) => {
      l.ingest({ kind: 'event', value });
      a.ingestEvent(value);
    }),
    source.onLifecycle((value) => {
      l.ingest({ kind: 'lifecycle', value });
      a.applyLifecycle(value);
    }),
  ];

  return () => {
    for (const u of unsubs) u();
    setDropHandler(null);
  };
}
