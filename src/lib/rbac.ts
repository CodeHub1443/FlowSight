import { EVENT_REGISTRY, type Role } from '@/domain';

// Role-based UX gates (docs/01 section 2). Real enforcement is server-side; these decide what the UI shows.
// The route / action part of the matrix (`can(user, 'events.ack', ...)`) is added when those screens land.

// ---------------------------------------------------------------------------
// Event category visibility. V = view, A = view + ack/close/note.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/**
 * Captain names: never for KIOSK, and for HQ_VIEWER only when the site setting `showCaptainNames` is on
 * (default off; the setting is not exposed to the frontend yet, so HQ is treated as off).
 */
export function canSeeCaptainNames(role: Role): boolean {
  return role !== 'KIOSK' && role !== 'HQ_VIEWER';
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** `/analytics` (docs/01 section 3): every role except the video-wall account. Bay level only. */
export function canViewAnalytics(role: Role): boolean {
  return role !== 'KIOSK';
}
