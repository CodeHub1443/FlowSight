import { getSimRuntime } from '@/data/mock';
import { alertStore, liveStore } from '@/stores';

// What `pnpm soak` (scripts/soak) reads from the running page. Debug builds only, like qualityProbe: a production build
// contains none of this.

export interface SoakProbe {
  /** Size of every collection in the live and alert stores. */
  stores(): Record<string, number>;
  /** Size of the simulator's history, in the worker. */
  sim(): Promise<Record<string, number>>;
  /** Simulator speed. Unlike the dev panel it works in either language and leaves no panel in the DOM. */
  setSpeed(speed: number): void;
}

declare global {
  interface Window {
    __soakProbe?: SoakProbe;
  }
}

export function installSoakProbe(): void {
  window.__soakProbe = {
    stores() {
      const live = liveStore.getState();
      const alerts = alertStore.getState();
      return {
        liveBays: Object.keys(live.bays).length,
        liveBayRxAt: Object.keys(live.bayRxAt).length,
        liveActors: Object.keys(live.actors).length,
        liveVisits: Object.keys(live.visits).length,
        alertEvents: Object.keys(alerts.events).length,
        alertLifecycleAt: Object.keys(alerts.lifecycleAt).length,
        alertPending: Object.keys(alerts.pending).length,
        alertUnread: Object.keys(alerts.unreadIds).length,
      };
    },
    async sim() {
      const res = await getSimRuntime().request({
        method: 'GET',
        path: '/__mock/history-sizes',
        query: {},
        actor: { userId: 'soak', name: 'soak', role: 'ADMIN' },
      });
      return res.body as Record<string, number>;
    },
    setSpeed(speed) {
      getSimRuntime().send({ t: 'speed', speed });
    },
  };
}
