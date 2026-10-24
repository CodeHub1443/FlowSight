import { EVENT_REGISTRY, type EventStatus, type Role, type WhEventWithStatus } from '@/domain';

// Event category visibility per role (docs/01 section 2). Pure, no UI. V = view, A = view + ack/close/note.
// src/lib/rbac.ts will own the wider permission matrix later; this is the category part the alert store needs.

export type EventCategory = (typeof EVENT_REGISTRY)[number]['category'];
export type CategoryAccess = 'V' | 'A' | null;

export const EVENT_CATEGORIES: readonly EventCategory[] = [
  ...new Set(EVENT_REGISTRY.map((e) => e.category)),
];

const ROLE_ORDER = [
  'HQ_VIEWER',
  'DC_MANAGER',
  'SHIFT_SUPERVISOR',
  'SECURITY',
  'ADMIN',
  'KIOSK',
] as const satisfies readonly Role[];

// Columns follow ROLE_ORDER. "-" is no access.
const ROWS: Record<EventCategory, string> = {
  truck: 'V A A A A V',
  belt: 'V A A V A V',
  hygiene: 'V A A A A V',
  handling: 'V A A V A -',
  ppe: 'V A A A A V',
  compliance: 'V A A A A V',
  roster: '- A A - A -',
  staging: 'V A A - A V',
  security: '- A V A A -',
  system: 'V A A A A V',
};

function parseRow(row: string): Record<Role, CategoryAccess> {
  const cells = row.split(' ');
  const entries = ROLE_ORDER.map((role, i): [Role, CategoryAccess] => {
    const c = cells[i];
    return [role, c === 'V' || c === 'A' ? c : null];
  });
  return Object.fromEntries(entries) as Record<Role, CategoryAccess>;
}

export const CATEGORY_ACCESS: Record<
  EventCategory,
  Record<Role, CategoryAccess>
> = Object.fromEntries(EVENT_CATEGORIES.map((c) => [c, parseRow(ROWS[c])] as const)) as Record<
  EventCategory,
  Record<Role, CategoryAccess>
>;

export function categoryAccess(role: Role, category: EventCategory): CategoryAccess {
  return CATEGORY_ACCESS[category][role];
}

export function canViewCategory(role: Role, category: EventCategory): boolean {
  return categoryAccess(role, category) !== null;
}

export function canActOnCategory(role: Role, category: EventCategory): boolean {
  return categoryAccess(role, category) === 'A';
}

export function visibleCategories(role: Role): EventCategory[] {
  return EVENT_CATEGORIES.filter((c) => canViewCategory(role, c));
}

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
