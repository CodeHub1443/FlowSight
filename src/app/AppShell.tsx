import { Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { TopBar } from './shell/TopBar';

/** App chrome: the top bar on every route, then the page filling the rest of the viewport. */
export function AppShell() {
  return (
    <TooltipProvider>
      <div className="flex h-screen min-h-0 flex-col">
        <TopBar />
        <main className="relative min-h-0 flex-1">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </TooltipProvider>
  );
}

/** Layout for ordinary pages: scrolling, padded, with the "Developed by TDI" footer. /live is full-bleed instead. */
export function PageLayout() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="flex-1 p-6">
        <Outlet />
      </div>
      <footer className="text-muted-foreground flex items-center gap-2 px-6 py-3 text-sm">
        <img src="/brand/tdi-logo.svg" alt="TDI" className="h-5" />
        <span>{t('app.developedBy')}</span>
      </footer>
    </div>
  );
}
