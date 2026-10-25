import type { BayState, Lang, Role } from '@/domain';
import { canSeeCaptainNames } from '@/lib/rbac';

// UX-level privacy gates for the live screen (docs/01 section 2). Real enforcement is server-side;
// the role rules live in src/lib/rbac.ts.

export { canSeeCaptainNames };

/** The captain's name for display, or null when absent from the message or the role may not see it. */
export function captainName(bay: BayState, role: Role): Lang | null {
  return canSeeCaptainNames(role) ? (bay.crew.captain?.name ?? null) : null;
}
