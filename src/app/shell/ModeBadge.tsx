import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useFmt } from '@/features/live';
import { cn } from '@/lib/utils';
import { clockNow, subscribeClock, useConnStatus, useLiveStore } from '@/stores';
import { CONN_TONE } from '@/features/live';
import { TONE_DOT, TONE_TEXT, TONE_TINT } from '@/components/common';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const MODE_TONE = { live: 'ok', mock: 'neutral', replay: 'warn' } as const;

const noReplayTs = () => null;
/** Minute of the wall clock: the badge shows HH:MM, so it re-renders once a minute, not on every 1 Hz tick. */
const wallMinute = () => Math.floor(clockNow() / 60_000) * 60_000;

/** LIVE / MOCK / REPLAY badge (from VITE_DATA_MODE) with the Asia/Dhaka clock. Replay shows the replayed moment. */
export function ModeBadge() {
  const { t } = useTranslation('live');
  const fmt = useFmt();
  const mode = import.meta.env.VITE_DATA_MODE;
  const wall = useSyncExternalStore(subscribeClock, wallMinute, wallMinute);
  // Only replay shows the stream time; other modes do not re-render on every 4 Hz flush.
  const lastTs = useLiveStore(mode === 'replay' ? (s) => s.lastTs : noReplayTs);
  const shown = mode === 'replay' && lastTs !== null ? lastTs : wall;
  return (
    <span
      data-testid="mode-badge"
      data-mode={mode}
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-full px-3 text-[13px] font-semibold whitespace-nowrap',
        TONE_TINT[MODE_TONE[mode]],
        TONE_TEXT[MODE_TONE[mode]],
      )}
    >
      <span className={cn('size-2 rounded-full', TONE_DOT[MODE_TONE[mode]])} aria-hidden />
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
          className="grid size-8 place-items-center"
        >
          <span
            className={cn(
              'soft-transition size-2.5 rounded-full',
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
