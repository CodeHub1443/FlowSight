import { useTranslation } from 'react-i18next';
import { NavLink, Route, Routes, useLocation } from 'react-router';
import { StatusPill } from '@/components/common';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { NotFound } from '@/app/NotFound';
import { Placeholder } from '@/app/Placeholder';
import { canViewAnalytics } from '@/lib/rbac';
import { cn } from '@/lib/utils';
import { useSessionStore } from '@/stores';
import { PerformanceTab } from './perf/PerformanceTab';
import { RangeSelector } from './RangeSelector';
import { ANALYTICS_TABS, PLACEHOLDER_TABS } from './tabs';
import { useRange } from './useRange';

// /analytics (lazy route chunk). Tabs are nested routes: /analytics = Performance, /analytics/<tab> for the rest.
// The range lives in the URL (?range=) and is kept when switching tabs.

export default function AnalyticsPage() {
  const { t } = useTranslation('analytics');
  const role = useSessionStore((s) => s.role);
  const [range, setRange] = useRange();
  const { search } = useLocation();

  if (!canViewAnalytics(role)) {
    return (
      <p data-testid="analytics-forbidden" className="text-ink-600 text-sm">
        {t('forbidden')}
      </p>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="analytics-page">
      <header className="flex min-w-0 flex-wrap items-center gap-3">
        <h1 className="text-ink-900 text-xl leading-7 font-semibold">{t('title')}</h1>
        {import.meta.env.VITE_DATA_MODE === 'mock' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} data-testid="analytics-simulated" className="rounded-full">
                <StatusPill tone="neutral">{t('simulated')}</StatusPill>
              </span>
            </TooltipTrigger>
            <TooltipContent>{t('simulatedHint')}</TooltipContent>
          </Tooltip>
        )}
        <div className="ms-auto">
          <RangeSelector value={range} onChange={setRange} />
        </div>
      </header>

      <nav aria-label={t('tabsLabel')} className="-mx-1 overflow-x-auto px-1">
        <ul className="border-border flex min-w-max items-center gap-1 border-b">
          {ANALYTICS_TABS.map((tab) => (
            <li key={tab.id}>
              <NavLink
                to={{ pathname: tab.path ? `/analytics/${tab.path}` : '/analytics', search }}
                end
                data-tab={tab.id}
                className={({ isActive }) =>
                  cn(
                    'soft-transition focus-visible:ring-ring/50 -mb-px flex h-10 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap focus-visible:ring-[3px] focus-visible:outline-none',
                    isActive
                      ? 'border-info text-ink-900'
                      : 'text-ink-600 hover:text-ink-900 border-transparent',
                  )
                }
              >
                {t(`tabs.${tab.id}`)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <Routes>
        <Route index element={<PerformanceTab range={range} />} />
        {PLACEHOLDER_TABS.map((tab) => (
          <Route
            key={tab.id}
            path={tab.path}
            element={<Placeholder titleKey={`analytics:tabs.${tab.id}`} />}
          />
        ))}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}
