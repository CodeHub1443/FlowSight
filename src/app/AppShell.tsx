import { useMemo } from 'react';
import { Outlet } from 'react-router';
import { DevelopedBy } from '@/components/common';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { useKpiRowBottom } from '@/stores';
import { QueryProvider } from './QueryProvider';
import { computeToastOffsetTop } from './shell/toastOffset';
import { TopBar } from './shell/TopBar';

/**
 * Live-event toasts sit top-centre, 12 px below the /live KPI row's real measured bottom edge (docs/06 §7.10,
 * t22b.4; `computeToastOffsetTop`, reported by `KpiChips` into `uiStore.kpiRowBottom`), so it stays correct at
 * any width, with the row collapsed or expanded, and in EN and BN — a fixed guess (t22b.3) overlapped the cards.
 * Off /live, where the row is unmounted, it falls back to the old safe-area estimate; it is moot there since
 * every other toast keeps sonner's own bottom-right default (the `Toaster`'s own `position` prop, below),
 * including a live toast the user is still looking at after navigating away from /live — its
 * `position: 'top-center'` is set once, on `notifyRuntime.tsx`'s `toast.custom()` call itself, not read
 * reactively from the current route. One `<Toaster>` instance stays mounted everywhere: an earlier version
 * swapped the Toaster's own `position` prop on `pathname === '/live'`, which sonner reads as a change of
 * *group* (each position renders its own keyed `<ol>`) — any toast already on screen when the route changed
 * got unmounted and rebuilt into the new group mid-navigation, which this offset-only, per-toast-position
 * approach cannot do.
 */

/** App chrome: the top bar on every route, then the page filling the rest of the viewport. Owns the REST query client. */
export function AppShell() {
  const kpiRowBottom = useKpiRowBottom();
  const toastOffset = useMemo(() => ({ top: computeToastOffsetTop(kpiRowBottom) }), [kpiRowBottom]);
  return (
    <QueryProvider>
      <TooltipProvider>
        <div className="flex h-screen min-h-0 flex-col print:block print:h-auto">
          <TopBar />
          <main className="relative min-h-0 flex-1 print:static print:block">
            <Outlet />
          </main>
        </div>
        <Toaster offset={toastOffset} />
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
