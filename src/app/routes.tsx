import { Navigate, Route, Routes } from 'react-router';
import { ADMIN_CHILDREN } from './adminRoutes';
import { AppShell } from './AppShell';
import { NotFound } from './NotFound';
import { Placeholder } from './Placeholder';

const page = (titleKey: string) => <Placeholder titleKey={titleKey} />;

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/live" replace />} />
        <Route path="live" element={page('routes.live')} />
        <Route path="bays/:bayId" element={page('routes.bays')} />
        <Route path="trucks" element={page('routes.trucks')} />
        <Route path="analytics" element={page('routes.analytics')} />
        <Route path="leaderboard" element={page('routes.leaderboard')} />
        <Route path="events" element={page('routes.events')} />
        <Route path="events/:id" element={page('routes.event')} />
        <Route path="reports" element={page('routes.reports')} />
        <Route path="replay" element={page('routes.replay')} />
        <Route path="admin" element={page('routes.admin')}>
          {ADMIN_CHILDREN.map(([path, titleKey]) => (
            <Route key={path} path={path} element={page(titleKey)} />
          ))}
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="wall" element={page('routes.wall')} />
      <Route path="login" element={page('routes.login')} />
    </Routes>
  );
}
