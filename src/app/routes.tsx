import { lazy, Suspense, type ComponentType } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import type { Role } from '@/domain';
import { LivePage } from '@/features/live';
import { canAccessEvents, canAccessReports } from '@/lib/rbac';
import { ADMIN_CHILDREN } from './adminRoutes';
import { AppShell, PageLayout } from './AppShell';
import { LiveScene } from './LiveScene';
import { NotFound } from './NotFound';
import { Placeholder } from './Placeholder';
import { RouteFallback } from './RouteFallback';
import { RouteGuard } from './RouteGuard';

// Dev only: `import.meta.env.DEV` is false at build time, so neither the route nor its chunk reaches production.
const AssetPreview = import.meta.env.DEV ? lazy(() => import('./dev/AssetPreview')) : null;
// Analytics (and ECharts with it) is its own chunk: never in the /live entry (docs/02 section 6, t20 spec section 4).
const AnalyticsPage = lazy(() => import('@/features/analytics/AnalyticsPage'));

// Events and reports are their own chunks too (t22 spec section 2): never in the /live entry.
const EventsPage = lazy(() => import('@/features/events').then((m) => ({ default: m.EventsPage })));
const ReportsPage = lazy(() =>
  import('@/features/reports').then((m) => ({ default: m.ReportsPage })),
);

/** A lazy page behind the role guard. The guard sits outside Suspense, so a role without access never loads the chunk. */
const guarded = (allow: (role: Role) => boolean, Page: ComponentType) => (
  <RouteGuard allow={allow}>
    <Suspense fallback={<RouteFallback />}>
      <Page />
    </Suspense>
  </RouteGuard>
);

const page = (titleKey: string) => <Placeholder titleKey={titleKey} />;

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/live" replace />} />
        <Route path="live" element={<LivePage scene={<LiveScene />} />} />
        <Route element={<PageLayout />}>
          <Route path="bays/:bayId" element={page('routes.bays')} />
          <Route path="trucks" element={page('routes.trucks')} />
          <Route
            path="analytics/*"
            element={
              <Suspense fallback={<RouteFallback />}>
                <AnalyticsPage />
              </Suspense>
            }
          />
          <Route path="leaderboard" element={page('routes.leaderboard')} />
          <Route path="events" element={guarded(canAccessEvents, EventsPage)} />
          <Route path="events/:id" element={guarded(canAccessEvents, EventsPage)} />
          <Route path="reports" element={guarded(canAccessReports, ReportsPage)} />
          <Route path="replay" element={page('routes.replay')} />
          <Route path="admin" element={page('routes.admin')}>
            {ADMIN_CHILDREN.map(([path, titleKey]) => (
              <Route key={path} path={path} element={page(titleKey)} />
            ))}
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
      {AssetPreview && (
        <Route
          path="dev/assets"
          element={
            <Suspense fallback={<RouteFallback />}>
              <AssetPreview />
            </Suspense>
          }
        />
      )}
      <Route path="wall" element={page('routes.wall')} />
      <Route path="login" element={page('routes.login')} />
    </Routes>
  );
}
