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
        <Button variant="outline" className="h-9 min-w-0 gap-2 px-3" data-testid="site-switcher">
          <span className="flex min-w-0 items-baseline gap-2">
            {/* Short site label from the shared `app.sample` string until the site list API supplies short names. */}
            <span className="truncate font-semibold" data-testid="sample-string">
              {tc('app.sample')}
            </span>
            <span className="text-muted-foreground hidden truncate text-[0.85rem] font-normal 2xl:inline">
              {kpi
                ? t('topbar.baysActive', {
                    running: fmt.num(kpi.baysRunning),
                    total: fmt.num(kpi.baysTotal),
                  })
                : '—'}
            </span>
          </span>
          <ChevronDown className="text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-muted-foreground text-[0.8rem]">
          {t('topbar.sites')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SITES.map((site) => (
          <DropdownMenuItem key={site.id} className="justify-between gap-3 text-[1rem]">
            <span className="min-w-0">
              <span className="block truncate font-semibold">
                {site.name[fmt.lang] || site.name.en}
              </span>
              <span className="text-muted-foreground block truncate text-[0.85rem]">
                {site.org}
              </span>
            </span>
            {site.id === DEFAULT_SITE.id && <Check className="size-4 shrink-0" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
