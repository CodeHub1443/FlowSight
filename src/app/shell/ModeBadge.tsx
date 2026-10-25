import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useFmt } from '@/features/live';
import { cn } from '@/lib/utils';
import { clockNow, subscribeClock, useConnStatus, useLiveStore } from '@/stores';
import { CONN_TONE } from '@/features/live';
import { TONE_DOT } from '@/components/common';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const MODE_STYLE = {
  live: 'bg-status-ok/15',
  mock: 'bg-status-neutral/15',
  replay: 'bg-status-warn/25',
} as const;
const MODE_DOT = {
  live: 'bg-status-ok',
  mock: 'bg-status-neutral',
  replay: 'bg-status-warn',
} as const;

/** LIVE / MOCK / REPLAY badge (from VITE_DATA_MODE) with the Asia/Dhaka clock. Replay shows the replayed moment. */
export function ModeBadge() {
  const { t } = useTranslation('live');
  const fmt = useFmt();
  const mode = import.meta.env.VITE_DATA_MODE;
  const wall = useSyncExternalStore(subscribeClock, clockNow, clockNow);
  const lastTs = useLiveStore((s) => s.lastTs);
  const shown = mode === 'replay' && lastTs !== null ? lastTs : wall;
  return (
    <span
      data-testid="mode-badge"
      data-mode={mode}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-full px-3 font-semibold whitespace-nowrap',
        MODE_STYLE[mode],
      )}
    >
      <span className={cn('size-2 rounded-full', MODE_DOT[mode])} aria-hidden />
      <span>{t(`topbar.mode.${mode}`)}</span>
      <span className="tabular-nums" data-testid="mode-clock">
        {fmt.clock(shown)}
      </span>
    </span>
  );
}

/** Connection health dot (useConnStatus): connecting, live, degraded, offline. */
export function ConnDot() {
  const { t } = useTranslation('live');
  const status = useConnStatus();
  const label = t(`conn.${status}`);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          tabIndex={0}
          data-testid="conn-dot"
          data-status={status}
          aria-label={`${t('topbar.connection')}: ${label}`}
          className="grid size-9 place-items-center"
        >
          <span
            className={cn(
              'size-3 rounded-full',
              TONE_DOT[CONN_TONE[status]],
              status === 'connecting' && 'animate-pulse',
            )}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent>{`${t('topbar.connection')}: ${label}`}</TooltipContent>
    </Tooltip>
  );
}
