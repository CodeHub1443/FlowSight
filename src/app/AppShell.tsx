import { Outlet } from 'react-router';
import { DevelopedBy } from '@/components/common';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { QueryProvider } from './QueryProvider';
import { TopBar } from './shell/TopBar';

/** App chrome: the top bar on every route, then the page filling the rest of the viewport. Owns the REST query client. */
export function AppShell() {
  return (
    <QueryProvider>
      <TooltipProvider>
        <div className="flex h-screen min-h-0 flex-col print:block print:h-auto">
          <TopBar />
          <main className="relative min-h-0 flex-1 print:static print:block">
            <Outlet />
          </main>
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryProvider>
  );
}

/** Layout for ordinary pages: scrolling, padded, with the "Developed by TDI" footer. /live is full-bleed instead. */
export function PageLayout() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto print:block print:h-auto print:overflow-visible">
      <div className="flex-1 p-6 print:p-0">
        <Outlet />
      </div>
      <footer className="print:hidden flex items-center px-6 py-3">
        <DevelopedBy variant="footer" />
      </footer>
    </div>
  );
}
