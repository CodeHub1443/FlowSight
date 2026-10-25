import { Outlet, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { LivePage } from '@/features/live';
import { TopBar } from './shell/TopBar';

/**
 * App chrome: the top bar on every route, then the page.
 *
 * /live is rendered here (a full-bleed scene with floating panels) because routes.tsx is owned by the main session
 * and still maps /live to a placeholder. The route's own element stays mounted but visually hidden so the existing
 * route tests keep passing. When the main session points the `live` route at <LivePage/>, delete the `isLive` branch.
 */
export function AppShell() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isLive = pathname === '/live';
  return (
    <TooltipProvider>
      <div className="flex h-screen min-h-0 flex-col">
        <TopBar />
        {isLive ? (
          <main className="relative min-h-0 flex-1">
            <LivePage />
            <div className="sr-only">
              <Outlet />
            </div>
          </main>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <main className="flex-1 p-6">
              <Outlet />
            </main>
            <footer className="text-muted-foreground flex items-center gap-2 px-6 py-3 text-sm">
              <img src="/brand/tdi-logo.svg" alt="TDI" className="h-5" />
              <span>{t('app.developedBy')}</span>
            </footer>
          </div>
        )}
      </div>
      <Toaster />
    </TooltipProvider>
  );
}
