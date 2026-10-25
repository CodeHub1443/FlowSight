import type { EventStatus, Role, WhEventWithStatus } from '@/domain';
import { canViewCategory, type EventCategory } from '@/lib/rbac';

// Alert filtering for the alert store and hooks. The category matrix itself lives in src/lib/rbac.ts
// (docs/01 section 2); it is re-exported here so existing imports keep working.

export {
  CATEGORY_ACCESS,
  EVENT_CATEGORIES,
  canActOnCategory,
  canViewCategory,
  categoryAccess,
  visibleCategories,
  type CategoryAccess,
  type EventCategory,
} from '@/lib/rbac';

export interface AlertFilter {
  /** Role whose category matrix applies. The hooks default this to the session role. */
  role?: Role;
  /** Narrow to these categories (still intersected with what the role may view). */
  categories?: readonly EventCategory[];
  bay?: string;
  /** Default: OPEN and ACK, i.e. everything not closed. */
  statuses?: readonly EventStatus[];
}

const DEFAULT_STATUSES: readonly EventStatus[] = ['OPEN', 'ACK'];

export function matchesAlertFilter(e: WhEventWithStatus, f: AlertFilter): boolean {
  if (f.role !== undefined && !canViewCategory(f.role, e.category)) return false;
  if (f.categories !== undefined && !f.categories.includes(e.category)) return false;
  if (f.bay !== undefined && e.bay !== f.bay) return false;
  return (f.statuses ?? DEFAULT_STATUSES).includes(e.status);
}

/** Matching events, newest first. */
export function filterAlerts(
  events: Iterable<WhEventWithStatus>,
  filter: AlertFilter = {},
): WhEventWithStatus[] {
  const out: WhEventWithStatus[] = [];
  for (const e of events) if (matchesAlertFilter(e, filter)) out.push(e);
  return out.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
}
