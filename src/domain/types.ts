import type { z } from 'zod';
import type {
  ActorActSchema,
  ActorKindSchema,
  ActorRoleSchema,
  BeltDirectionSchema,
  BeltStatusSchema,
  CameraRoleSchema,
  CameraStatusSchema,
  CaseFlagSchema,
  DoorStatusSchema,
  EventStatusSchema,
  PackTypeSchema,
  RoleSchema,
  SeveritySchema,
  UiLangSchema,
  VisitPhaseSchema,
} from './enums';
import type * as S from './schemas';

// Types are inferred from the zod schemas only (no hand-written interfaces).

export type Severity = z.infer<typeof SeveritySchema>;
export type DoorStatus = z.infer<typeof DoorStatusSchema>;
export type BeltStatus = z.infer<typeof BeltStatusSchema>;
export type BeltDirection = z.infer<typeof BeltDirectionSchema>;
export type VisitPhase = z.infer<typeof VisitPhaseSchema>;
export type CameraStatus = z.infer<typeof CameraStatusSchema>;
export type CameraRole = z.infer<typeof CameraRoleSchema>;
export type ActorKind = z.infer<typeof ActorKindSchema>;
export type ActorRole = z.infer<typeof ActorRoleSchema>;
export type ActorAct = z.infer<typeof ActorActSchema>;
export type PackType = z.infer<typeof PackTypeSchema>;
export type CaseFlag = z.infer<typeof CaseFlagSchema>;
export type EventStatus = z.infer<typeof EventStatusSchema>;
export type Role = z.infer<typeof RoleSchema>;
/** UI language code (User.lang). */
export type UiLang = z.infer<typeof UiLangSchema>;

/** Bilingual text { en, bn } (the contract's Lang). */
export type Lang = z.infer<typeof S.LangSchema>;

export type SiteState = z.infer<typeof S.SiteStateSchema>;
export type BayState = z.infer<typeof S.BayStateSchema>;
export type BayVisit = NonNullable<BayState['visit']>;
export type Actor = z.infer<typeof S.ActorSchema>;
export type ActorsFrame = z.infer<typeof S.ActorsFrameSchema>;
export type CaseTick = z.infer<typeof S.CaseTickSchema>;
export type EventLifecycleUpdate = z.infer<typeof S.EventLifecycleUpdateSchema>;
export type HealthFrame = z.infer<typeof S.HealthFrameSchema>;

export type { WhEvent, WhEventWithStatus, EventKey } from './events';

export type Series = z.infer<typeof S.SeriesSchema>;
export type Page<T> = { items: T[]; nextCursor: string | null };
export type ApiError = z.infer<typeof S.ApiErrorSchema>;
export type User = z.infer<typeof S.UserSchema>;
export type NatsCreds = z.infer<typeof S.NatsCredsSchema>;
export type SiteSummary = z.infer<typeof S.SiteSummarySchema>;
export type Visit = z.infer<typeof S.VisitSchema>;
export type LeaderboardRow = z.infer<typeof S.LeaderboardRowSchema>;

export type LoginResponse = z.infer<typeof S.LoginResponseSchema>;
export type Snapshot = z.infer<typeof S.SnapshotSchema>;
export type Presign = z.infer<typeof S.PresignSchema>;
export type VisitDetail = z.infer<typeof S.VisitDetailSchema>;
export type ThroughputResponse = z.infer<typeof S.ThroughputResponseSchema>;
export type DwellResponse = z.infer<typeof S.DwellResponseSchema>;
export type BeltUtilisationResponse = z.infer<typeof S.BeltUtilisationResponseSchema>;
export type SkuAnalyticsResponse = z.infer<typeof S.SkuAnalyticsResponseSchema>;
export type ComplianceResponse = z.infer<typeof S.ComplianceResponseSchema>;
export type HygieneResponse = z.infer<typeof S.HygieneResponseSchema>;
export type ProductivityResponse = z.infer<typeof S.ProductivityResponseSchema>;
export type PeopleResponse = z.infer<typeof S.PeopleResponseSchema>;
export type CameraUptimeResponse = z.infer<typeof S.CameraUptimeResponseSchema>;
export type LeaderboardResponse = z.infer<typeof S.LeaderboardResponseSchema>;
export type ReportResponse = z.infer<typeof S.ReportResponseSchema>;
export type ReplayResponse = z.infer<typeof S.ReplayResponseSchema>;

export type ShiftWindow = z.infer<typeof S.ShiftWindowSchema>;
export type Shift = z.infer<typeof S.ShiftSchema>;
export type ShiftsConfig = z.infer<typeof S.ShiftsConfigSchema>;
export type RosterAssignment = z.infer<typeof S.RosterAssignmentSchema>;
export type Employee = z.infer<typeof S.EmployeeSchema>;
export type Sku = z.infer<typeof S.SkuSchema>;
export type BayCfg = z.infer<typeof S.BayCfgSchema>;
export type CameraCfg = z.infer<typeof S.CameraCfgSchema>;
export type Thresholds = z.infer<typeof S.ThresholdsSchema>;
export type AlertRule = z.infer<typeof S.AlertRuleSchema>;
export type TelegramCfg = z.infer<typeof S.TelegramCfgSchema>;
export type AdminUser = z.infer<typeof S.AdminUserSchema>;

export type SiteConfig = z.infer<typeof S.SiteConfigSchema>;
