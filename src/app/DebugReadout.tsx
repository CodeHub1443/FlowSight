import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DataSource } from '@/data';
import { MockControls, MockSource } from '@/data/mock';
import { RoleSchema } from '@/domain';
import { formatClock } from '@/lib/time';
import {
  alertStore,
  liveStore,
  MESSAGE_KINDS,
  useConnStatus,
  useLiveStore,
  useSessionStore,
  sessionStore,
} from '@/stores';
import { useDataSource } from './dataSourceContext';

/** Available in `pnpm dev`, and in builds made with VITE_DEBUG_PANEL=1 (the e2e run). */
const DEBUG_PANEL_ENABLED = import.meta.env.DEV || import.meta.env.VITE_DEBUG_PANEL === '1';

function Panel() {
  const { t } = useTranslation();
  const status = useConnStatus();
  const stats = useLiveStore((s) => s.stats);
  const lastTs = useLiveStore((s) => s.lastTs);
  const bayCount = useLiveStore((s) => Object.keys(s.bays).length);
  const role = useSessionStore((s) => s.role);

  return (
    <aside
      data-testid="debug-readout"
      className="bg-card text-card-foreground fixed right-4 bottom-4 z-50 w-80 rounded-xl border p-4 text-sm shadow-lg"
    >
      <h2 className="mb-2 font-semibold">{t('debug.title')}</h2>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
        <dt>{t('debug.status')}</dt>
        <dd data-testid="debug-status">{status}</dd>
        <dt>{t('debug.mode')}</dt>
        <dd>{import.meta.env.VITE_DATA_MODE}</dd>
        <dt>{t('debug.baysReceived')}</dt>
        <dd data-testid="debug-bays">{bayCount}</dd>
        <dt>{t('debug.lastTs')}</dt>
        {/* data-ts: the instant, so a test can tell a clock on the peak day from the same clock on another day */}
        <dd data-testid="debug-last-ts" data-ts={lastTs ?? undefined}>
          {lastTs === null ? '-' : formatClock(lastTs, { seconds: true })}
        </dd>
        <dt>
          <label htmlFor="debug-role">{t('debug.role')}</label>
        </dt>
        <dd>
          <select
            id="debug-role"
            value={role}
            onChange={(e) => sessionStore.getState().setMockRole(RoleSchema.parse(e.target.value))}
            className="bg-background w-full rounded border px-1"
          >
            {RoleSchema.options.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </dd>
      </dl>
      <table className="mt-3 w-full text-left">
        <thead>
          <tr className="text-muted-foreground">
            <th className="font-normal">{t('debug.kind')}</th>
            <th className="text-right font-normal">{t('debug.received')}</th>
            <th className="text-right font-normal">{t('debug.dropped')}</th>
          </tr>
        </thead>
        <tbody>
          {MESSAGE_KINDS.map((k) => (
            <tr key={k} data-testid={`debug-row-${k}`}>
              <td>{t(`debug.kinds.${k}`)}</td>
              <td className="text-right tabular-nums" data-testid={`debug-received-${k}`}>
                {stats.received[k]}
              </td>
              <td className="text-right tabular-nums" data-testid={`debug-dropped-${k}`}>
                {stats.dropped[k]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </aside>
  );
}

/** Simulator controls next to the readout (mock mode only: MockControls renders nothing for other sources). */
function SimulatorPanel() {
  const source = useDataSource();
  const role = useSessionStore((s) => s.role);
  if (!source || role === 'KIOSK') return null;
  return <MockControls source={source} className="fixed right-[22rem] bottom-4 z-50" />;
}

/**
 * A simulator restart (new seed or start scenario) can move simulated time backwards, and the stores ignore messages
 * older than what they hold. Start the stores fresh each time the simulator becomes ready again.
 */
function useFreshStoresOnSimRestart(source: DataSource | null) {
  useEffect(() => {
    if (!(source instanceof MockSource)) return;
    let ready = source.control.get().ready;
    return source.control.subscribe((c) => {
      if (c.ready && !ready) {
        liveStore.getState().reset();
        alertStore.getState().reset();
        liveStore.getState().setSourceStatus(source.status.get());
      }
      ready = c.ready;
    });
  }, [source]);
}

/** Dev-only pipe check and simulator controls, toggled with Ctrl+Shift+D. Not a feature screen. */
export function DebugReadout() {
  const [open, setOpen] = useState(false);
  useFreshStoresOnSimRestart(useDataSource());

  useEffect(() => {
    if (!DEBUG_PANEL_ENABLED) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return DEBUG_PANEL_ENABLED && open ? (
    <>
      <Panel />
      <SimulatorPanel />
    </>
  ) : null;
}
