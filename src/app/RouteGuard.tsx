import type { ReactNode } from 'react';
import type { Role } from '@/domain';
import { useSessionStore } from '@/stores/hooks';
import { NotAvailable } from './NotAvailable';

/** Renders `children` when `allow(role)` holds for the session role, else the "Not available for your role" page. */
export function RouteGuard({
  allow,
  children,
}: {
  allow: (role: Role) => boolean;
  children: ReactNode;
}) {
  const role = useSessionStore((s) => s.role);
  return allow(role) ? <>{children}</> : <NotAvailable />;
}
