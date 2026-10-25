import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { TONE_DOT } from '@/components/common';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { focusObject, SEV_TONE, useFmt } from '@/features/live';
import { bayLabel } from '@/features/live';
import { cn } from '@/lib/utils';
import { useOpenAlerts } from '@/stores';
import type { Severity } from '@/domain';

const MAX_LISTED = 8;

/** Alert bell with count and dropdown. Alerts come from useOpenAlerts(), already filtered by the session role. */
export function AlertBell() {
  const { t } = useTranslation('live');
  const fmt = useFmt();
  const navigate = useNavigate();
  const alerts = useOpenAlerts();
  const worst: Severity | null = alerts.some((a) => a.sev === 'critical')
    ? 'critical'
    : alerts.some((a) => a.sev === 'warn')
      ? 'warn'
      : alerts.length > 0
        ? 'info'
        : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative"
          aria-label={t('bell.label', { n: fmt.num(alerts.length) })}
          data-testid="alert-bell"
        >
          <Bell />
          {worst && (
            <span
              data-testid="alert-bell-count"
              className={cn(
                'absolute -top-1.5 -right-1.5 grid min-w-5 place-items-center rounded-full px-1 text-[0.72rem] leading-5 font-bold text-white tabular-nums',
                TONE_DOT[SEV_TONE[worst]],
              )}
            >
              {alerts.length > 99 ? `${fmt.num(99)}+` : fmt.num(alerts.length)}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[22rem] p-1.5" data-testid="alert-bell-menu">
        <DropdownMenuLabel className="text-[0.9rem]">
          {t('bell.title', { n: fmt.num(alerts.length) })}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {alerts.length === 0 && (
          <p className="text-muted-foreground px-2 py-4 text-center">{t('bell.empty')}</p>
        )}
        {alerts.slice(0, MAX_LISTED).map((e) => (
          <DropdownMenuItem
            key={e.id}
            data-testid={`bell-alert-${e.id}`}
            className="items-start gap-2.5 py-2 text-[1rem]"
            onSelect={() => {
              focusObject({ kind: 'event', id: e.id });
              void navigate('/live');
            }}
          >
            <span
              className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', TONE_DOT[SEV_TONE[e.sev]])}
              aria-hidden
            />
            <span className="min-w-0">
              <span className="block truncate font-semibold">
                {e.title[fmt.lang] || e.title.en}
              </span>
              <span className="text-muted-foreground block truncate text-[0.85rem]">
                {[e.bay ? bayLabel(e.bay, fmt.lang) : null, fmt.clock(e.ts)]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="justify-center text-[1rem]"
          onSelect={() => void navigate('/events')}
        >
          {t('bell.viewAll')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
