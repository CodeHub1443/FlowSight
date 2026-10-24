import { z } from 'zod';
import {
  ActorActSchema,
  ActorKindSchema,
  ActorRoleSchema,
  AlertChannelSchema,
  BeltDirectionSchema,
  BeltStatusSchema,
  CameraRoleSchema,
  CameraStatusSchema,
  CaptainIdSourceSchema,
  CaseDirSchema,
  CaseFlagSchema,
  DirectionModeSchema,
  DirectionSourceSchema,
  DoorStatusSchema,
  EmployeeRoleSchema,
  EtaSourceSchema,
  EventStatusSchema,
  LeaderboardPeriodSchema,
  PackTypeSchema,
  RoleSchema,
  SeveritySchema,
  SiteStatusSchema,
  UiLangSchema,
  VisitDirSchema,
  VisitPhaseSchema,
} from './enums';
import { WhEventSchema, WhEventWithStatusSchema } from './events';
import {
  BayIdSchema,
  CameraIdSchema,
  EmployeeIdSchema,
  SiteIdSchema,
  SkuCodeSchema,
  TrackIdSchema,
  UlidSchema,
  VisitIdSchema,
} from './ids';
import {
  ConfSchema,
  CountSchema,
  HHmmSchema,
  IsoDateSchema,
  IsoTsSchema,
  LangSchema,
  NonNegSchema,
  PctSchema,
  VersionSchema,
} from './primitives';
import { ShiftWindowSchema } from './siteConfig';

export * from './enums';
export * from './ids';
export * from './primitives';
export * from './siteConfig';
export { WhEventSchema, WhEventWithStatusSchema } from './events';

// ---------------------------------------------------------------------------
// Live messages (docs/03 section 3). Unknown keys are stripped, enums are closed, `v` is literally 1.
// ---------------------------------------------------------------------------

// 3.1 SiteState
export const SiteStateSchema = z.object({
  v: VersionSchema,
  ts: IsoTsSchema,
  site: SiteIdSchema,
  businessDay: IsoDateSchema,
  shift: z.object({ id: z.string().min(1), start: IsoTsSchema, end: IsoTsSchema }),
  kpi: z.object({
    casesOut: CountSchema,
    casesIn: CountSchema,
    // Deltas compare with the same clock time on the previous business day; null when unavailable.
    casesOutDeltaPct: z.number().nullable(),
    casesInDeltaPct: z.number().nullable(),
    trucksOnSite: CountSchema,
    trucksDocked: CountSchema,
    trucksWaiting: CountSchema,
    baysRunning: CountSchema,
    baysTotal: CountSchema,
    avgTatMin: NonNegSchema,
    avgTatDeltaMin: z.number().nullable(),
    complianceScore: PctSchema,
    openAlerts: z.object({ info: CountSchema, warn: CountSchema, critical: CountSchema }),
  }),
});

// 3.2 BayState
const bayVisitSchema = z.object({
  visitId: VisitIdSchema,
  plate: z.object({ bn: z.string(), en: z.string(), conf: ConfSchema }),
  agency: LangSchema,
  phase: VisitPhaseSchema,
  arrivedAt: IsoTsSchema,
  dockedAt: IsoTsSchema.nullable(),
  startedAt: IsoTsSchema.nullable(),
  finishedAt: IsoTsSchema.nullable(),
  departedAt: IsoTsSchema.nullable(),
  casesIn: CountSchema,
  casesOut: CountSchema,
  expected: CountSchema.nullable(),
  etaMin: NonNegSchema,
  etaSource: EtaSourceSchema,
  damage: CountSchema,
  openTape: CountSchema,
  tornSack: CountSchema,
  fallOff: CountSchema,
  skuTop: z.array(z.object({ sku: SkuCodeSchema, count: CountSchema, conf: ConfSchema })),
});

const bayCaptainSchema = z.object({
  present: z.boolean(),
  trackId: TrackIdSchema,
  employeeId: EmployeeIdSchema,
  // null for users not permitted to see names (and on NATS unless the site setting showCaptainNames is true)
  name: LangSchema.nullable(),
  idSource: CaptainIdSourceSchema,
});

export const BayStateSchema = z.object({
  v: VersionSchema,
  ts: IsoTsSchema,
  site: SiteIdSchema,
  bay: BayIdSchema,
  door: z.object({ status: DoorStatusSchema }),
  belt: z.object({
    status: BeltStatusSchema,
    since: IsoTsSchema,
    direction: BeltDirectionSchema,
    directionSource: DirectionSourceSchema,
    rateCpm: NonNegSchema,
    // Sums to seconds elapsed since SiteState.shift.start.
    shiftSec: z.object({
      runningLoaded: NonNegSchema,
      runningEmpty: NonNegSchema,
      stopped: NonNegSchema,
      noTruck: NonNegSchema,
    }),
  }),
  visit: bayVisitSchema.nullable(),
  crew: z.object({
    total: CountSchema,
    captains: CountSchema,
    workers: CountSchema,
    forkliftOps: CountSchema,
    captain: bayCaptainSchema.nullable(),
    ppeViolationsNow: CountSchema,
  }),
  staging: z.object({
    occupancyPct: PctSchema,
    palletsWaiting: CountSchema,
    oldestWaitSec: NonNegSchema,
  }),
  today: z.object({
    casesOut: CountSchema,
    casesIn: CountSchema,
    trucks: CountSchema,
    avgTatMin: NonNegSchema,
    damage: CountSchema,
    fallOff: CountSchema,
    ppe: CountSchema,
  }),
  health: z.object({
    cams: z.record(CameraIdSchema, CameraStatusSchema),
    lagMs: NonNegSchema,
  }),
  alerts: z.object({ open: CountSchema, maxSev: SeveritySchema }),
});

// 3.3 ActorsFrame. No names or employee IDs; `act` has no PHONE / IDLE (privacy rule).
export const ActorSchema = z.object({
  id: TrackIdSchema,
  kind: ActorKindSchema,
  role: ActorRoleSchema,
  x: z.number(),
  y: z.number(),
  // radians, range (-pi, pi]
  h: z.number().gt(-Math.PI).lte(Math.PI),
  act: ActorActSchema,
  ppeOk: z.boolean().nullable(),
});

export const ActorsFrameSchema = z.object({
  v: VersionSchema,
  ts: IsoTsSchema,
  site: SiteIdSchema,
  bay: BayIdSchema,
  actors: z.array(ActorSchema),
});

// 3.4 CaseTick
export const CaseTickSchema = z.object({
  v: VersionSchema,
  ts: IsoTsSchema,
  site: SiteIdSchema,
  bay: BayIdSchema,
  dir: CaseDirSchema,
  sku: SkuCodeSchema,
  pack: PackTypeSchema,
  conf: ConfSchema,
  flag: CaseFlagSchema.nullable(),
});

// 3.5 WhEvent: see events.ts (registry keyed "category.type").

// 3.6 EventLifecycleUpdate
export const EventLifecycleUpdateSchema = z.object({
  v: VersionSchema,
  id: UlidSchema,
  site: SiteIdSchema,
  status: EventStatusSchema,
  by: z.object({ userId: z.string().min(1), name: z.string() }),
  at: IsoTsSchema,
  note: z.string().nullable(),
});

// 3.7 HealthFrame
export const HealthFrameSchema = z.object({
  v: VersionSchema,
  ts: IsoTsSchema,
  site: SiteIdSchema,
  cams: z.array(
    z.object({
      cam: CameraIdSchema,
      status: CameraStatusSchema,
      fps: NonNegSchema,
      lastFrameAt: IsoTsSchema,
    }),
  ),
  pipeline: z.object({ lagMs: NonNegSchema, gpuPct: PctSchema, host: z.string() }),
});

// ---------------------------------------------------------------------------
// REST (docs/03 section 4)
// ---------------------------------------------------------------------------

// 4.1 Common shapes
export function PageSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}

export const ApiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
});

export const SeriesSchema = z.object({
  key: z.string(),
  label: LangSchema,
  // t = ISO bucket start
  points: z.array(z.object({ t: IsoTsSchema, v: z.number().nullable() })),
});

export const UserSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  role: RoleSchema,
  sites: z.array(SiteIdSchema),
  lang: UiLangSchema,
});

// Subscribe-only NATS credentials.
export const NatsCredsSchema = z.object({
  wsUrl: z.string().min(1),
  user: z.string(),
  token: z.string(),
  expiresAt: IsoTsSchema,
});

export const SiteSummarySchema = z.object({
  id: SiteIdSchema,
  name: LangSchema,
  baseUrl: z.string(),
  baysTotal: CountSchema,
  baysRunning: CountSchema,
  status: SiteStatusSchema,
});

export const VisitSchema = z.object({
  visitId: VisitIdSchema,
  site: SiteIdSchema,
  bay: BayIdSchema,
  plate: z.object({ bn: z.string(), en: z.string(), conf: ConfSchema }),
  agency: LangSchema.nullable(),
  dir: VisitDirSchema,
  phase: VisitPhaseSchema,
  arrivedAt: IsoTsSchema,
  dockedAt: IsoTsSchema.nullable(),
  startedAt: IsoTsSchema.nullable(),
  finishedAt: IsoTsSchema.nullable(),
  departedAt: IsoTsSchema.nullable(),
  dwell: z.object({
    waitToStartMin: NonNegSchema.nullable(),
    activeMin: NonNegSchema.nullable(),
    postLoadMin: NonNegSchema.nullable(),
    totalMin: NonNegSchema.nullable(),
  }),
  casesOut: CountSchema,
  casesIn: CountSchema,
  expected: CountSchema.nullable(),
  hygiene: z.object({
    damaged: CountSchema,
    openTape: CountSchema,
    tornSack: CountSchema,
    wetStained: CountSchema,
    fallOff: CountSchema,
  }),
  sku: z.array(
    z.object({
      sku: SkuCodeSchema,
      name: LangSchema.nullable(),
      pack: PackTypeSchema,
      count: CountSchema,
      conf: ConfSchema,
    }),
  ),
  captain: z.object({ employeeId: EmployeeIdSchema, name: LangSchema.nullable() }).nullable(),
  eventIds: z.array(UlidSchema),
  detention: z.boolean(),
});

export const LeaderboardRowSchema = z.object({
  rank: z.number().int().positive(),
  employeeId: EmployeeIdSchema,
  name: LangSchema.nullable(),
  bays: z.array(BayIdSchema),
  metrics: z.object({
    casesOut: CountSchema,
    casesIn: CountSchema,
    trucks: CountSchema,
    casesPerHour: NonNegSchema,
    avgTatMin: NonNegSchema.nullable(),
    damageRatePct: NonNegSchema,
    ppeCompliancePct: PctSchema,
    stoppedPct: PctSchema,
  }),
  score: z.number(),
  scoreParts: z.object({
    throughput: z.number(),
    tat: z.number(),
    damage: z.number(),
    compliance: z.number(),
    idle: z.number(),
  }),
  mixFactor: z.number(),
  trend: z.array(z.number()),
});

// 4.2 Endpoint responses
export const LoginResponseSchema = z.object({ user: UserSchema, natsCreds: NatsCredsSchema });

export const SnapshotSchema = z.object({
  site: SiteStateSchema,
  bays: z.array(BayStateSchema),
  openEvents: z.array(WhEventWithStatusSchema),
  health: HealthFrameSchema,
});

export const PresignSchema = z.object({ url: z.string().min(1), expiresAt: IsoTsSchema });

export const VisitDetailSchema = z.object({
  visit: VisitSchema,
  events: z.array(WhEventWithStatusSchema),
});

export const ThroughputResponseSchema = z.object({ series: z.array(SeriesSchema) });

export const DwellResponseSchema = z.object({
  groups: z.array(
    z.object({
      key: z.string(),
      label: LangSchema,
      n: CountSchema,
      waitToStartMin: NonNegSchema,
      activeMin: NonNegSchema,
      postLoadMin: NonNegSchema,
      p90TotalMin: NonNegSchema,
      detentions: CountSchema,
    }),
  ),
  histogram: z.array(z.object({ binMin: NonNegSchema, count: CountSchema })),
});

export const BeltUtilisationResponseSchema = z.object({
  bays: z.array(
    z.object({
      bay: BayIdSchema,
      sec: z.object({
        runningLoaded: NonNegSchema,
        runningEmpty: NonNegSchema,
        stopped: NonNegSchema,
        noTruck: NonNegSchema,
        offline: NonNegSchema,
      }),
      intervals: z.array(z.object({ status: z.string(), start: IsoTsSchema, end: IsoTsSchema })),
    }),
  ),
});

export const SkuAnalyticsResponseSchema = z.object({
  rows: z.array(
    z.object({
      sku: SkuCodeSchema,
      name: LangSchema.nullable(),
      pack: z.string(),
      count: CountSchema,
      avgConf: ConfSchema,
    }),
  ),
  unknownSharePct: PctSchema,
});

export const ComplianceResponseSchema = z.object({
  byType: z.array(z.object({ type: z.string(), count: CountSchema })),
  heatmap: z.array(
    z.object({ bay: BayIdSchema, hour: z.number().int().min(0).max(23), count: CountSchema }),
  ),
  score: SeriesSchema,
});

const hygieneRowSchema = z.object({
  key: z.string(),
  label: LangSchema,
  damaged: CountSchema,
  openTape: CountSchema,
  tornSack: CountSchema,
  wetStained: CountSchema,
  fallOff: CountSchema,
  ratePct: NonNegSchema,
});

export const HygieneResponseSchema = z.object({
  bySku: z.array(hygieneRowSchema),
  byBay: z.array(hygieneRowSchema),
  byAgency: z.array(hygieneRowSchema),
});

export const ProductivityResponseSchema = z.object({
  rows: z.array(
    z.object({
      bay: BayIdSchema,
      shift: z.string(),
      casesPerManHour: NonNegSchema,
      avgCrew: NonNegSchema,
      palletWaitP50Sec: NonNegSchema,
      palletWaitP90Sec: NonNegSchema,
    }),
  ),
});

// DC_MANAGER and ADMIN only. Never on NATS, never live.
export const PeopleResponseSchema = z.object({
  rows: z.array(
    z.object({
      bay: BayIdSchema,
      shift: z.string(),
      trackId: TrackIdSchema,
      role: z.string(),
      idleMin: NonNegSchema,
      phoneMin: NonNegSchema,
    }),
  ),
});

export const CameraUptimeResponseSchema = z.object({
  cams: z.array(z.object({ cam: CameraIdSchema, uptimePct: PctSchema, incidents: CountSchema })),
});

export const LeaderboardResponseSchema = z.object({
  period: LeaderboardPeriodSchema,
  from: IsoTsSchema,
  to: IsoTsSchema,
  rows: z.array(LeaderboardRowSchema),
  weights: z.record(z.string(), z.number()),
});

// docs/03 section 4.2 types the report `bays` and `sku` elements as `{...}[]` without a shape; accept any object
// until the contract defines them (reported as a contract ambiguity).
const unspecifiedRowSchema = z.record(z.string(), z.unknown());

export const ReportResponseSchema = z.object({
  kpi: SiteStateSchema.shape.kpi,
  bays: z.array(unspecifiedRowSchema),
  captains: z.array(LeaderboardRowSchema),
  visits: z.array(VisitSchema),
  topEvents: z.array(WhEventWithStatusSchema),
  sku: z.array(unspecifiedRowSchema),
});

export const ReplayResponseSchema = z.object({
  keyframes: z.array(z.object({ ts: IsoTsSchema, bays: z.array(BayStateSchema) })),
  actors: z.array(ActorsFrameSchema),
  events: z.array(WhEventSchema),
});

// 4.3 Admin objects
export const ShiftSchema = ShiftWindowSchema.extend({ name: LangSchema });

export const ShiftsConfigSchema = z.object({
  businessDayStart: HHmmSchema,
  shifts: z.array(ShiftSchema),
});

export const RosterAssignmentSchema = z.object({
  date: IsoDateSchema,
  shiftId: z.string().min(1),
  bay: BayIdSchema,
  employeeId: EmployeeIdSchema,
  assignedBy: z.string(),
  at: IsoTsSchema,
});

export const EmployeeSchema = z.object({
  employeeId: EmployeeIdSchema,
  name: LangSchema,
  role: EmployeeRoleSchema,
  active: z.boolean(),
});

export const SkuSchema = z.object({
  sku: SkuCodeSchema,
  modelClass: z.string(),
  name: LangSchema,
  pack: PackTypeSchema,
  unitsPerPack: z.number().int().positive(),
  color: z.string(),
});

export const BayCfgSchema = z.object({
  id: BayIdSchema,
  label: LangSchema,
  conveyor: z.string(),
  directionMode: DirectionModeSchema,
  enabled: z.boolean(),
});

// No credentials, ever.
export const CameraCfgSchema = z.object({
  cam: CameraIdSchema,
  bay: BayIdSchema,
  role: CameraRoleSchema,
  rtspHost: z.string(),
  enabled: z.boolean(),
});

export const AlertRuleSchema = z.object({
  id: z.string().min(1),
  site: SiteIdSchema,
  categories: z.array(z.string()),
  minSev: SeveritySchema,
  bays: z.union([z.array(BayIdSchema), z.literal('ALL')]),
  channel: AlertChannelSchema,
  chatId: z.string(),
  cooldownMin: NonNegSchema,
  quietHours: z.object({ start: HHmmSchema, end: HHmmSchema }).nullable(),
  enabled: z.boolean(),
});

// The bot token is never returned.
export const TelegramCfgSchema = z.object({
  botConfigured: z.boolean(),
  botName: z.string().nullable(),
  digestChatIds: z.array(z.string()),
  digestAtShiftEnd: z.boolean(),
});

export const AdminUserSchema = UserSchema.extend({
  active: z.boolean(),
  lastLoginAt: IsoTsSchema.nullable(),
});
