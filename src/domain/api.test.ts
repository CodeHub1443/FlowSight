// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import bayState from './fixtures/bay-state.json';
import actorsFrame from './fixtures/actors-frame.json';
import healthFrame from './fixtures/health-frame.json';
import siteState from './fixtures/site-state.json';
import whEvent from './fixtures/wh-event.json';
import {
  AdminUserSchema,
  AlertRuleSchema,
  ApiErrorSchema,
  BayCfgSchema,
  BeltUtilisationResponseSchema,
  CameraCfgSchema,
  CameraUptimeResponseSchema,
  ComplianceResponseSchema,
  DwellResponseSchema,
  EmployeeSchema,
  HygieneResponseSchema,
  LeaderboardResponseSchema,
  LeaderboardRowSchema,
  LoginResponseSchema,
  NatsCredsSchema,
  PageSchema,
  PeopleResponseSchema,
  PresignSchema,
  ProductivityResponseSchema,
  ReplayResponseSchema,
  ReportSchema,
  RosterAssignmentSchema,
  SeriesSchema,
  ShiftsConfigSchema,
  SiteSummarySchema,
  SkuAnalyticsResponseSchema,
  SkuSchema,
  SnapshotSchema,
  TelegramCfgSchema,
  ThresholdsSchema,
  ThroughputResponseSchema,
  UserSchema,
  VisitDetailSchema,
  VisitSchema,
  WhEventWithStatusSchema,
} from './schemas';
import { REMOVE, mutate } from './testing';

const T = '2026-10-24T19:50:45+06:00';
const lang = { en: 'Name', bn: 'নাম' };
const eventWithStatus = {
  ...whEvent,
  status: 'OPEN',
  ack: null,
  closed: null,
  notes: [{ by: 'u-07', at: T, text: 'checking' }],
};
const user = {
  id: 'u-07',
  name: 'Shift Supervisor B',
  role: 'SHIFT_SUPERVISOR',
  sites: ['dhk-depot'],
  lang: 'bn',
};
const natsCreds = { wsUrl: 'ws://10.0.0.5:8080', user: 'browser', token: 'abc', expiresAt: T };
const visit = {
  visitId: 'V-20261024-B02-0007',
  site: 'dhk-depot',
  bay: 'B02',
  plate: { bn: 'ঢাকা মেট্রো-ড ১১-২১৭১', en: 'DHAKA METRO-DA 11-2171', conf: 0.93 },
  agency: null,
  dir: 'MIXED',
  phase: 'DEPARTED',
  arrivedAt: T,
  dockedAt: T,
  startedAt: T,
  finishedAt: T,
  departedAt: T,
  dwell: { waitToStartMin: 5, activeMin: 40, postLoadMin: 3, totalMin: 58 },
  casesOut: 412,
  casesIn: 12,
  expected: null,
  hygiene: { damaged: 1, openTape: 0, tornSack: 0, wetStained: 0, fallOff: 0 },
  sku: [{ sku: 'RIN-PB-1KG', name: null, pack: 'SACK', count: 212, conf: 0.91 }],
  captain: { employeeId: 'EMP-1043', name: null },
  eventIds: ['01M5Q2V6W0M9S346Q3D25VT4F5'],
  detention: false,
};
const row = {
  rank: 1,
  employeeId: 'EMP-1043',
  name: lang,
  bays: ['B02'],
  metrics: {
    casesOut: 2410,
    casesIn: 380,
    trucks: 9,
    casesPerHour: 301.2,
    avgTatMin: null,
    damageRatePct: 0.4,
    ppeCompliancePct: 97,
    stoppedPct: 12,
  },
  score: 88.5,
  scoreParts: { throughput: 30, tat: 20, damage: 15, compliance: 15, idle: 8.5 },
  mixFactor: 1.05,
  trend: [80, 85, 88.5],
};
const series = {
  key: 'B02:OUT',
  label: lang,
  points: [
    { t: T, v: 12 },
    { t: T, v: null },
  ],
};
const hygieneRow = {
  key: 'RIN-PB-1KG',
  label: lang,
  damaged: 1,
  openTape: 0,
  tornSack: 0,
  wetStained: 0,
  fallOff: 0,
  ratePct: 0.4,
};
const kpi = siteState.kpi;
const reportBay = {
  bay: 'B02',
  casesOut: 2410,
  casesIn: 380,
  trucks: 9,
  avgTatMin: null,
  avgOccupancyMin: 41.5,
  beltSec: { runningLoaded: 1, runningEmpty: 2, stopped: 3, noTruck: 4, offline: 0 },
  damaged: 1,
  openTape: 0,
  tornSack: 0,
  wetStained: 0,
  fallOff: 0,
  ppe: 3,
  detentions: 1,
};

type Sample = {
  name: string;
  schema: ZodType;
  value: unknown;
  bad: { path: (string | number)[]; value: unknown };
};

const samples: Sample[] = [
  { name: 'User', schema: UserSchema, value: user, bad: { path: ['role'], value: 'GUEST' } },
  {
    name: 'NatsCreds',
    schema: NatsCredsSchema,
    value: natsCreds,
    bad: { path: ['expiresAt'], value: '2026-10-24T19:50:45' },
  },
  {
    name: 'LoginResponse',
    schema: LoginResponseSchema,
    value: { user, natsCreds },
    bad: { path: ['user', 'lang'], value: 'fr' },
  },
  {
    name: 'SiteSummary',
    schema: SiteSummarySchema,
    value: {
      id: 'dhk-depot',
      name: lang,
      baseUrl: 'http://10.0.0.5',
      baysTotal: 7,
      baysRunning: 5,
      status: 'ONLINE',
    },
    bad: { path: ['status'], value: 'UP' },
  },
  {
    name: 'Series',
    schema: SeriesSchema,
    value: series,
    bad: { path: ['points', 0, 't'], value: '2026-10-24' },
  },
  { name: 'Visit', schema: VisitSchema, value: visit, bad: { path: ['dir'], value: 'SIDE' } },
  {
    name: 'LeaderboardRow',
    schema: LeaderboardRowSchema,
    value: row,
    bad: { path: ['scoreParts', 'idle'], value: 'x' },
  },
  {
    name: 'WhEventWithStatus',
    schema: WhEventWithStatusSchema,
    value: eventWithStatus,
    bad: { path: ['status'], value: 'DONE' },
  },
  {
    name: 'Snapshot',
    schema: SnapshotSchema,
    value: {
      site: siteState,
      bays: [bayState],
      openEvents: [eventWithStatus],
      health: healthFrame,
    },
    bad: { path: ['bays', 0, 'bay'], value: 'bay-2' },
  },
  {
    name: 'Presign',
    schema: PresignSchema,
    value: { url: 'http://minio/x?sig=1', expiresAt: T },
    bad: { path: ['url'], value: '' },
  },
  {
    name: 'VisitDetail',
    schema: VisitDetailSchema,
    value: { visit, events: [eventWithStatus] },
    bad: { path: ['visit', 'phase'], value: 'GONE' },
  },
  {
    name: 'Throughput',
    schema: ThroughputResponseSchema,
    value: { series: [series] },
    bad: { path: ['series', 0, 'points', 0, 'v'], value: 'x' },
  },
  {
    name: 'Dwell',
    schema: DwellResponseSchema,
    value: {
      groups: [
        {
          key: 'B02',
          label: lang,
          n: 9,
          waitToStartMin: 12,
          activeMin: 40,
          postLoadMin: 3,
          p90TotalMin: 80,
          detentions: 1,
        },
      ],
      histogram: [{ binMin: 0, count: 3 }],
    },
    bad: { path: ['groups', 0, 'n'], value: -1 },
  },
  {
    name: 'BeltUtilisation',
    schema: BeltUtilisationResponseSchema,
    value: {
      bays: [
        {
          bay: 'B02',
          sec: { runningLoaded: 1, runningEmpty: 2, stopped: 3, noTruck: 4, offline: 0 },
          intervals: [{ status: 'STOPPED', start: T, end: T }],
        },
      ],
    },
    bad: { path: ['bays', 0, 'sec', 'offline'], value: REMOVE },
  },
  {
    name: 'SkuAnalytics',
    schema: SkuAnalyticsResponseSchema,
    value: {
      rows: [{ sku: 'RIN-PB-1KG', name: null, pack: 'SACK', count: 5, avgConf: 0.9 }],
      unknownSharePct: 3.5,
    },
    bad: { path: ['unknownSharePct'], value: 120 },
  },
  {
    name: 'Compliance',
    schema: ComplianceResponseSchema,
    value: {
      byType: [{ type: 'ppe.violation', count: 3 }],
      heatmap: [{ bay: 'B02', hour: 14, count: 1 }],
      score: series,
    },
    bad: { path: ['heatmap', 0, 'hour'], value: 25 },
  },
  {
    name: 'Hygiene',
    schema: HygieneResponseSchema,
    value: { bySku: [hygieneRow], byBay: [hygieneRow], byAgency: [hygieneRow] },
    bad: { path: ['byBay', 0, 'damaged'], value: 1.5 },
  },
  {
    name: 'Productivity',
    schema: ProductivityResponseSchema,
    value: {
      rows: [
        {
          bay: 'B02',
          shift: 'B',
          casesPerManHour: 60,
          avgCrew: 5.5,
          palletWaitP50Sec: 90,
          palletWaitP90Sec: 240,
        },
      ],
    },
    bad: { path: ['rows', 0, 'bay'], value: REMOVE },
  },
  {
    name: 'People',
    schema: PeopleResponseSchema,
    value: {
      rows: [{ bay: 'B02', shift: 'B', trackId: 't-91', role: 'WORKER', idleMin: 12, phoneMin: 3 }],
    },
    bad: { path: ['rows', 0, 'phoneMin'], value: REMOVE },
  },
  {
    name: 'CameraUptime',
    schema: CameraUptimeResponseSchema,
    value: { cams: [{ cam: 'B02-BELT', uptimePct: 99.5, incidents: 1 }] },
    bad: { path: ['cams', 0, 'cam'], value: 'cam-1' },
  },
  {
    name: 'Leaderboard',
    schema: LeaderboardResponseSchema,
    value: {
      period: 'shift',
      from: T,
      to: T,
      rows: [row],
      weights: { throughput: 0.4, tat: 0.2, damage: 0.15, compliance: 0.15, idle: 0.1 },
    },
    bad: { path: ['period'], value: 'year' },
  },
  {
    name: 'Report',
    schema: ReportSchema,
    value: {
      kind: 'shift',
      site: 'dhk-depot',
      businessDay: '2026-10-24',
      shiftId: 'B',
      from: T,
      to: T,
      kpi,
      bays: [reportBay],
      captains: [row],
      visits: [visit],
      topEvents: [eventWithStatus],
      sku: [{ sku: 'RIN-PB-1KG', name: null, pack: 'SACK', count: 5, avgConf: 0.9 }],
    },
    bad: { path: ['bays', 0, 'beltSec', 'offline'], value: REMOVE },
  },
  {
    name: 'Replay',
    schema: ReplayResponseSchema,
    value: { keyframes: [{ ts: T, bays: [bayState] }], actors: [actorsFrame], events: [whEvent] },
    bad: { path: ['events', 0, 'type'], value: 'exploded' },
  },
  {
    name: 'ShiftsConfig',
    schema: ShiftsConfigSchema,
    value: {
      businessDayStart: '06:00',
      shifts: [{ id: 'A', name: lang, start: '06:00', end: '14:00' }],
    },
    bad: { path: ['shifts', 0, 'start'], value: '6:00' },
  },
  {
    name: 'RosterAssignment',
    schema: RosterAssignmentSchema,
    value: {
      date: '2026-10-24',
      shiftId: 'B',
      bay: 'B02',
      employeeId: 'EMP-1043',
      assignedBy: 'u-07',
      at: T,
    },
    bad: { path: ['date'], value: '24/10/2026' },
  },
  {
    name: 'Employee',
    schema: EmployeeSchema,
    value: { employeeId: 'EMP-1043', name: lang, role: 'CAPTAIN', active: true },
    bad: { path: ['role'], value: 'BOSS' },
  },
  {
    name: 'Sku',
    schema: SkuSchema,
    value: {
      sku: 'RIN-PB-1KG',
      modelClass: 'rin_pb_1kg',
      name: lang,
      pack: 'SACK',
      unitsPerPack: 20,
      color: '#1F36C7',
    },
    bad: { path: ['pack'], value: 'BAG' },
  },
  {
    name: 'BayCfg',
    schema: BayCfgSchema,
    value: {
      id: 'B01',
      label: lang,
      conveyor: 'Conveyor-01',
      directionMode: 'AUTO',
      enabled: true,
    },
    bad: { path: ['directionMode'], value: 'BOTH' },
  },
  {
    name: 'CameraCfg',
    schema: CameraCfgSchema,
    value: { cam: 'B01-DOCK', bay: 'B01', role: 'DOCK', rtspHost: '10.0.1.11', enabled: true },
    bad: { path: ['role'], value: 'ROOF' },
  },
  {
    name: 'Thresholds',
    schema: ThresholdsSchema,
    value: {
      detentionMin: 90,
      waitToStartMin: 20,
      emptyRunMin: 10,
      finishedGapMin: 3,
      crowdingCount: 8,
      palletWaitSec: 300,
      doorOpenIdleMin: 15,
      staleBaySec: 15,
    },
    bad: { path: ['detentionMin'], value: REMOVE },
  },
  {
    name: 'AlertRule',
    schema: AlertRuleSchema,
    value: {
      id: 'r1',
      site: 'dhk-depot',
      categories: ['ppe'],
      minSev: 'warn',
      bays: 'ALL',
      channel: 'TELEGRAM',
      chatId: '-100123',
      cooldownMin: 10,
      quietHours: { start: '22:00', end: '06:00' },
      enabled: true,
    },
    bad: { path: ['channel'], value: 'SMS' },
  },
  {
    name: 'TelegramCfg',
    schema: TelegramCfgSchema,
    value: {
      botConfigured: true,
      botName: 'depot_bot',
      digestChatIds: ['-100123'],
      digestAtShiftEnd: false,
    },
    bad: { path: ['botConfigured'], value: 'yes' },
  },
  {
    name: 'AdminUser',
    schema: AdminUserSchema,
    value: { ...user, active: true, lastLoginAt: null },
    bad: { path: ['active'], value: REMOVE },
  },
];

describe.each(samples)('REST $name', ({ schema, value, bad }) => {
  it('accepts a valid sample', () => {
    const r = schema.safeParse(value);
    expect(r.success, r.success ? '' : JSON.stringify(r.error.issues)).toBe(true);
  });

  it('rejects an invalid variant', () => {
    expect(schema.safeParse(mutate(value, bad.path, bad.value)).success).toBe(false);
  });
});

describe('REST contract v1 clarifications', () => {
  const sec = { runningLoaded: 1, runningEmpty: 2, stopped: 3, noTruck: 4, offline: 0 };

  it('leaderboard weights need exactly the five score parts', () => {
    const w = { throughput: 1, tat: 1, damage: 1, compliance: 1, idle: 1 };
    const ok = { period: 'day', from: T, to: T, rows: [], weights: w };
    expect(LeaderboardResponseSchema.safeParse(ok).success).toBe(true);
    expect(
      LeaderboardResponseSchema.safeParse(mutate(ok, ['weights', 'idle'], REMOVE)).success,
    ).toBe(false);
    expect(LeaderboardResponseSchema.safeParse(mutate(ok, ['from'], '2026-10-24')).success).toBe(
      false,
    );
  });

  it('SkuRow pack is the pack enum; belt interval status is a BeltStatus', () => {
    const sku = {
      rows: [{ sku: 'X', name: null, pack: 'BAG', count: 1, avgConf: 0.5 }],
      unknownSharePct: 0,
    };
    expect(SkuAnalyticsResponseSchema.safeParse(sku).success).toBe(false);
    const util = {
      bays: [{ bay: 'B02', sec, intervals: [{ status: 'PAUSED', start: T, end: T }] }],
    };
    expect(BeltUtilisationResponseSchema.safeParse(util).success).toBe(false);
  });

  it('Report kind is shift or daily, shiftId may be null', () => {
    const r = {
      kind: 'daily',
      site: 'dhk-depot',
      businessDay: '2026-10-24',
      shiftId: null,
      from: T,
      to: T,
      kpi,
      bays: [],
      captains: [],
      visits: [],
      topEvents: [],
      sku: [],
    };
    expect(ReportSchema.safeParse(r).success).toBe(true);
    expect(ReportSchema.safeParse(mutate(r, ['kind'], 'weekly')).success).toBe(false);
  });
});

describe('REST common shapes', () => {
  it('Page<T> factory validates items and nextCursor', () => {
    const schema = PageSchema(VisitSchema);
    expect(schema.safeParse({ items: [visit], nextCursor: null }).success).toBe(true);
    expect(schema.safeParse({ items: [visit], nextCursor: 'abc' }).success).toBe(true);
    expect(schema.safeParse({ items: [visit] }).success).toBe(false);
    expect(schema.safeParse({ items: [{ ...visit, dir: 'X' }], nextCursor: null }).success).toBe(
      false,
    );
  });

  it('Page of events validates each event through the registry', () => {
    const schema = PageSchema(WhEventWithStatusSchema);
    expect(schema.safeParse({ items: [eventWithStatus], nextCursor: null }).success).toBe(true);
    expect(
      schema.safeParse({ items: [{ ...eventWithStatus, type: 'nope' }], nextCursor: null }).success,
    ).toBe(false);
  });

  it('ApiError carries code and message, details optional', () => {
    expect(ApiErrorSchema.safeParse({ error: { code: 'FORBIDDEN', message: 'no' } }).success).toBe(
      true,
    );
    expect(
      ApiErrorSchema.safeParse({ error: { code: 'X', message: 'm', details: { a: 1 } } }).success,
    ).toBe(true);
    expect(ApiErrorSchema.safeParse({ error: { code: 'X' } }).success).toBe(false);
  });

  it('strips unknown keys on REST objects', () => {
    const r = UserSchema.safeParse({ ...user, passwordHash: 'x' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).not.toHaveProperty('passwordHash');
  });
});
