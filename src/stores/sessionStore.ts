import { createStore, type StoreApi } from 'zustand';
import type { Role, User } from '@/domain';

// Session = the signed-in user. Real login arrives in step 12; until then a mock user per role is
// selectable (dev readout only, no auth UI). Never persisted: a session is not a UI preference.

export const MOCK_SITE_ID = 'dhk-depot';

export const MOCK_USERS: Record<Role, User> = {
  HQ_VIEWER: {
    id: 'u-hq',
    name: 'Mock HQ Viewer',
    role: 'HQ_VIEWER',
    sites: [MOCK_SITE_ID],
    lang: 'en',
  },
  DC_MANAGER: {
    id: 'u-dc',
    name: 'Mock DC Manager',
    role: 'DC_MANAGER',
    sites: [MOCK_SITE_ID],
    lang: 'en',
  },
  SHIFT_SUPERVISOR: {
    id: 'u-ss',
    name: 'Mock Shift Supervisor',
    role: 'SHIFT_SUPERVISOR',
    sites: [MOCK_SITE_ID],
    lang: 'en',
  },
  SECURITY: {
    id: 'u-sec',
    name: 'Mock Security',
    role: 'SECURITY',
    sites: [MOCK_SITE_ID],
    lang: 'en',
  },
  ADMIN: { id: 'u-ad', name: 'Mock Admin', role: 'ADMIN', sites: [MOCK_SITE_ID], lang: 'en' },
  KIOSK: { id: 'u-ki', name: 'Mock Kiosk', role: 'KIOSK', sites: [MOCK_SITE_ID], lang: 'en' },
};

export const DEFAULT_MOCK_ROLE: Role = 'DC_MANAGER';

export interface SessionState {
  user: User;
  role: Role;
  setMockRole(role: Role): void;
}
export type SessionStore = StoreApi<SessionState>;

export function createSessionStore(): SessionStore {
  return createStore<SessionState>()((set) => ({
    user: MOCK_USERS[DEFAULT_MOCK_ROLE],
    role: DEFAULT_MOCK_ROLE,
    setMockRole: (role) => set({ user: MOCK_USERS[role], role }),
  }));
}

export const sessionStore: SessionStore = createSessionStore();
