import type { AdminUser, NatsCreds, Role } from '@/domain';
import { iso } from '../mock/core/clock';
import { MOCK_LOGINS, MOCK_USERS, type ApiActor } from '../mock/core/api';

// The mock "login": usernames manager, hq, supervisor, security, admin, kiosk (any non-empty password).
// The page starts signed in as the depot manager so every screen works without visiting /login.

const DEFAULT_USER: AdminUser = MOCK_USERS[0] as AdminUser;

export interface Session {
  user: AdminUser | null;
}

export function createSession(): Session {
  return { user: DEFAULT_USER };
}

export function loginAs(session: Session, username: string, password: string): AdminUser | null {
  const id = MOCK_LOGINS[username.trim().toLowerCase()];
  const user = MOCK_USERS.find((u) => u.id === id);
  if (!user || password.length === 0) return null;
  session.user = user;
  return user;
}

export function actorOf(session: Session): ApiActor | null {
  const u = session.user;
  return u ? { userId: u.id, name: u.name, role: u.role } : null;
}

export function publicUser(u: AdminUser): {
  id: string;
  name: string;
  role: Role;
  sites: string[];
  lang: 'en' | 'bn';
} {
  return { id: u.id, name: u.name, role: u.role, sites: u.sites, lang: u.lang };
}

/** Subscribe-only credentials; the mock never opens a NATS connection. */
export function natsCreds(now = Date.now()): NatsCreds {
  return {
    wsUrl: 'ws://localhost:4223',
    user: 'viewer',
    token: 'mock-token',
    expiresAt: iso(now + 60 * 60_000),
  };
}
