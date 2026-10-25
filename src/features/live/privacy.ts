import type { BayState, Lang, Role } from '@/domain';

// UX-level privacy gates for the live screen (docs/01 section 2). Real enforcement is server-side;
// src/lib/rbac.ts will own the full matrix later (see docs/progress/step-05.md "Requests to main session").

/**
 * Captain names: never for KIOSK, and for HQ_VIEWER only when the site setting `showCaptainNames` is on
 * (default off; the setting is not exposed to the frontend yet, so HQ is treated as off).
 */
export function canSeeCaptainNames(role: Role): boolean {
  return role !== 'KIOSK' && role !== 'HQ_VIEWER';
}

/** The captain's name for display, or null when absent from the message or the role may not see it. */
export function captainName(bay: BayState, role: Role): Lang | null {
  return canSeeCaptainNames(role) ? (bay.crew.captain?.name ?? null) : null;
}
