import { z } from 'zod';
import {
  AdminUserSchema,
  AlertRuleSchema,
  BayCfgSchema,
  CameraCfgSchema,
  RosterAssignmentSchema,
  ShiftsConfigSchema,
  SkuSchema,
  TelegramCfgSchema,
  ThresholdsSchema,
  type AdminUser,
  type AlertRule,
  type BayCfg,
  type CameraCfg,
  type Employee,
  type Role,
  type RosterAssignment,
  type ShiftsConfig,
  type Sku,
  type TelegramCfg,
} from '@/domain';
import { shiftBounds } from '@/lib/time';
import { CAPTAINS, EMPLOYEES, SKU_MASTER } from '../catalog';
import { iso, HOUR } from '../clock';
import type { Depot } from '../depot';
import { bad, err, ok, type ApiRequest, type ApiResponse } from './util';

export const MOCK_USERS: readonly AdminUser[] = [
  {
    id: 'u-01',
    name: 'Depot Manager',
    role: 'DC_MANAGER',
    sites: ['dhk-depot'],
    lang: 'en',
    active: true,
    lastLoginAt: null,
  },
  {
    id: 'u-02',
    name: 'HQ Viewer',
    role: 'HQ_VIEWER',
    sites: ['dhk-depot'],
    lang: 'en',
    active: true,
    lastLoginAt: null,
  },
  {
    id: 'u-07',
    name: 'Shift Supervisor B',
    role: 'SHIFT_SUPERVISOR',
    sites: ['dhk-depot'],
    lang: 'bn',
    active: true,
    lastLoginAt: null,
  },
  {
    id: 'u-09',
    name: 'Security Desk',
    role: 'SECURITY',
    sites: ['dhk-depot'],
    lang: 'bn',
    active: true,
    lastLoginAt: null,
  },
  {
    id: 'u-10',
    name: 'TDI Admin',
    role: 'ADMIN',
    sites: ['dhk-depot'],
    lang: 'en',
    active: true,
    lastLoginAt: null,
  },
  {
    id: 'u-11',
    name: 'Control Room Wall',
    role: 'KIOSK',
    sites: ['dhk-depot'],
    lang: 'en',
    active: true,
    lastLoginAt: null,
  },
];

/** Login names accepted by the mock auth (any non-empty password). */
export const MOCK_LOGINS: Readonly<Record<string, string>> = {
  manager: 'u-01',
  hq: 'u-02',
  supervisor: 'u-07',
  security: 'u-09',
  admin: 'u-10',
  kiosk: 'u-11',
};

interface AdminData {
  shifts: ShiftsConfig;
  skus: Sku[];
  bays: BayCfg[];
  cameras: CameraCfg[];
  alertRules: AlertRule[];
  telegram: TelegramCfg;
  users: AdminUser[];
}

const stores = new WeakMap<Depot, AdminData>();

function dataOf(depot: Depot): AdminData {
  let d = stores.get(depot);
  if (d) return d;
  const names: Record<string, { en: string; bn: string }> = {
    A: { en: 'Shift A', bn: 'শিফট এ' },
    B: { en: 'Shift B', bn: 'শিফট বি' },
    C: { en: 'Shift C', bn: 'শিফট সি' },
  };
  d = {
    shifts: {
      businessDayStart: depot.cfg.businessDayStart,
      shifts: depot.cfg.shiftsPlaceholder.map((s) => ({
        ...s,
        name: names[s.id] ?? { en: `Shift ${s.id}`, bn: `শিফট ${s.id}` },
      })),
    },
    skus: SKU_MASTER.map((s) => ({
      sku: s.sku,
      modelClass: s.modelClass,
      name: s.name,
      pack: s.pack,
      unitsPerPack: s.unitsPerPack,
      color: s.color,
    })),
    bays: (depot.cfg.dockFaces[0]?.bays ?? []).map((b) => ({
      id: b.id,
      label: b.label,
      conveyor: b.conveyor,
      directionMode: b.directionMode,
      enabled: true,
    })),
    cameras: depot.bays.flatMap((b) =>
      (['DOCK', 'CREW', 'BELT'] as const).map((role) => ({
        cam: `${b.id}-${role}`,
        bay: b.id,
        role,
        rtspHost: `cam-${b.id.toLowerCase()}-${role.toLowerCase()}.depot.lan`,
        enabled: true,
      })),
    ),
    alertRules: [
      {
        id: 'r-1',
        site: depot.site,
        categories: ['truck', 'security'],
        minSev: 'warn',
        bays: 'ALL',
        channel: 'TELEGRAM',
        chatId: '-100200300',
        cooldownMin: 10,
        quietHours: null,
        enabled: true,
      },
      {
        id: 'r-2',
        site: depot.site,
        categories: ['system'],
        minSev: 'critical',
        bays: 'ALL',
        channel: 'TELEGRAM',
        chatId: '-100200301',
        cooldownMin: 30,
        quietHours: { start: '23:00', end: '06:00' },
        enabled: true,
      },
      {
        id: 'r-3',
        site: depot.site,
        categories: ['compliance', 'ppe'],
        minSev: 'warn',
        bays: ['B01', 'B02', 'B03'],
        channel: 'TELEGRAM',
        chatId: '-100200302',
        cooldownMin: 15,
        quietHours: null,
        enabled: false,
      },
    ],
    telegram: { botConfigured: false, botName: null, digestChatIds: [], digestAtShiftEnd: true },
    users: MOCK_USERS.map((u) => ({ ...u })),
  };
  stores.set(depot, d);
  return d;
}

const READ_ROLES: ReadonlySet<Role> = new Set(['ADMIN', 'DC_MANAGER', 'SHIFT_SUPERVISOR']);
const MANAGER_AREAS: ReadonlySet<string> = new Set([
  'shifts',
  'roster',
  'skus',
  'thresholds',
  'alert-rules',
  'employees',
]);

/** docs/01 section 3: ADMIN everything; DC_MANAGER shifts, roster, skus, thresholds, alert-rules; SHIFT_SUPERVISOR roster. */
function allowed(area: string, role: Role): boolean {
  if (role === 'ADMIN') return true;
  if (role === 'DC_MANAGER') return MANAGER_AREAS.has(area);
  if (role === 'SHIFT_SUPERVISOR') return area === 'roster' || area === 'employees';
  return false;
}

function rosterFor(depot: Depot, q: Record<string, string>): RosterAssignment[] | null {
  const date = q.date ?? depot.clock.businessDay(depot.now);
  const shiftId = q.shift ?? depot.clock.at(depot.now).id;
  const b = shiftBounds(date, shiftId, depot.cfg.shiftsPlaceholder, depot.cfg.businessDayStart);
  if (!b) return null;
  const start = b.start.getTime();
  return depot.bays.map((bay) => ({
    date,
    shiftId,
    bay: bay.id,
    employeeId: depot.captainFor(bay.id, start + HOUR / 2),
    assignedBy: 'u-07',
    at: iso(start - 2 * HOUR),
  }));
}

function parse<T>(
  schema: z.ZodType<T>,
  body: unknown,
): { ok: true; value: T } | { ok: false; res: ApiResponse } {
  const r = schema.safeParse(body);
  if (r.success) return { ok: true, value: r.data };
  return {
    ok: false,
    res: bad(
      'invalid body',
      r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    ),
  };
}

export function adminRoute(depot: Depot, req: ApiRequest): ApiResponse | null {
  const m = /^\/admin\/([a-z-]+)(?:\/([^/]+)(?:\/(test))?)?$/.exec(req.path);
  if (!m) return null;
  const area = m[1] ?? '';
  const id = m[2];
  const tail = m[3];
  const known = [
    'shifts',
    'roster',
    'employees',
    'skus',
    'bays',
    'cameras',
    'thresholds',
    'alert-rules',
    'telegram',
    'users',
  ];
  if (!known.includes(area)) return null;
  if (!READ_ROLES.has(req.actor.role) && req.actor.role !== 'ADMIN')
    return err(403, 'FORBIDDEN', 'not permitted');
  if (!allowed(area, req.actor.role))
    return err(403, 'FORBIDDEN', `role ${req.actor.role} may not use /admin/${area}`);
  const data = dataOf(depot);
  const get = req.method === 'GET';
  const put = req.method === 'PUT';

  if (area === 'alert-rules' && id && tail === 'test' && req.method === 'POST') {
    return data.alertRules.some((r) => r.id === id)
      ? { status: 204, body: null }
      : err(404, 'NOT_FOUND', 'alert rule not found');
  }
  if (id) return null;

  switch (area) {
    case 'shifts': {
      if (get) return ok(data.shifts);
      if (!put) return null;
      const p = parse(ShiftsConfigSchema, req.body);
      if (!p.ok) return p.res;
      data.shifts = p.value;
      return ok(data.shifts);
    }
    case 'roster': {
      if (get) {
        const list = rosterFor(depot, req.query);
        return list ? ok(list) : err(404, 'NOT_FOUND', 'unknown shift');
      }
      if (!put) return null;
      const p = parse(z.array(RosterAssignmentSchema), req.body);
      if (!p.ok) return p.res;
      for (const a of p.value) {
        if (!depot.bays.some((b) => b.id === a.bay)) return bad(`unknown bay ${a.bay}`);
        if (!CAPTAINS.some((c) => c.employeeId === a.employeeId))
          return bad(`${a.employeeId} is not a captain`);
        depot.rosterOverrides.set(`${a.date}|${a.shiftId}|${a.bay}`, a.employeeId);
      }
      const first = p.value[0];
      const list = rosterFor(depot, first ? { date: first.date, shift: first.shiftId } : req.query);
      return list ? ok(list) : err(404, 'NOT_FOUND', 'unknown shift');
    }
    case 'employees':
      return get
        ? ok(
            EMPLOYEES.map((e): Employee => ({
              employeeId: e.employeeId,
              name: e.name,
              role: e.role,
              active: e.active,
            })),
          )
        : null;
    case 'skus': {
      if (get) return ok(data.skus);
      if (!put) return null;
      const p = parse(z.array(SkuSchema), req.body);
      if (!p.ok) return p.res;
      data.skus = p.value;
      return ok(data.skus);
    }
    case 'bays': {
      if (get) return ok(data.bays);
      if (!put) return null;
      const p = parse(z.array(BayCfgSchema), req.body);
      if (!p.ok) return p.res;
      data.bays = p.value;
      return ok(data.bays);
    }
    case 'cameras': {
      if (get) return ok(data.cameras);
      if (!put) return null;
      const p = parse(z.array(CameraCfgSchema), req.body);
      if (!p.ok) return p.res;
      data.cameras = p.value;
      return ok(data.cameras);
    }
    case 'thresholds': {
      if (get) return ok(depot.cfg.thresholds);
      if (!put) return null;
      const p = parse(ThresholdsSchema, req.body);
      if (!p.ok) return p.res;
      // the simulator reads these live, so a change takes effect on the next step
      Object.assign(depot.cfg.thresholds, p.value);
      return ok(depot.cfg.thresholds);
    }
    case 'alert-rules': {
      if (get) return ok(data.alertRules);
      if (!put) return null;
      const p = parse(z.array(AlertRuleSchema), req.body);
      if (!p.ok) return p.res;
      data.alertRules = p.value;
      return ok(data.alertRules);
    }
    case 'telegram': {
      if (get) return ok(data.telegram);
      if (!put) return null;
      const p = parse(TelegramCfgSchema, req.body);
      if (!p.ok) return p.res;
      data.telegram = p.value;
      return ok(data.telegram);
    }
    case 'users': {
      if (get) return ok(data.users);
      if (!put) return null;
      const p = parse(z.array(AdminUserSchema), req.body);
      if (!p.ok) return p.res;
      data.users = p.value;
      return ok(data.users);
    }
    default:
      return null;
  }
}
