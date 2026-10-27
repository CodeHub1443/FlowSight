import { Check, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DEFAULT_SITE, SITES, useFmt } from '@/features/live';
import { useSiteKpi } from '@/stores';

/**
 * Site switcher: "Dhaka Central Depot · 5/7 bays active". One site today; the menu lists every site in config
 * (SITES) so multi-site only needs more config files plus a selected-site store (not built yet).
 */
export function SiteSwitcher() {
  const { t } = useTranslation('live');
  const { t: tc } = useTranslation();
  const fmt = useFmt();
  const kpi = useSiteKpi();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-10 min-w-0 gap-2.5 rounded-[12px] ps-1.5 pe-2.5"
          data-testid="site-switcher"
        >
          <span className="bg-brand-500 grid h-7 shrink-0 place-items-center rounded-[8px] px-1.5 text-[11px] font-semibold text-on-solid">
            {DEFAULT_SITE.id.split('-')[0]?.toUpperCase()}
          </span>
          <span className="flex min-w-0 flex-col items-start leading-tight">
            {/* Short site label from the shared `app.sample` string until the site list API supplies short names. */}
            <span
              className="text-ink-900 truncate text-[13px] font-semibold"
              data-testid="sample-string"
            >
              {tc('app.sample')}
            </span>
            <span className="text-ink-400 hidden truncate text-[11px] font-normal 2xl:inline">
              {kpi
                ? t('topbar.baysActive', {
                    running: fmt.num(kpi.baysRunning),
                    total: fmt.num(kpi.baysTotal),
                  })
                : '—'}
            </span>
          </span>
          <ChevronDown className="text-ink-400" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-ink-400 text-[12px] font-medium">
          {t('topbar.sites')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SITES.map((site) => (
          <DropdownMenuItem key={site.id} className="justify-between gap-3 text-[13px]">
            <span className="min-w-0">
              <span className="text-ink-900 block truncate font-medium">
                {site.name[fmt.lang] || site.name.en}
              </span>
              <span className="text-ink-400 block truncate text-[12px]">{site.org}</span>
            </span>
            {site.id === DEFAULT_SITE.id && <Check className="size-4 shrink-0" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
