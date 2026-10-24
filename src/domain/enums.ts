import { z } from 'zod';

// Closed enums from docs/03-data-contract.md. An unknown value is invalid by design.

export const SeveritySchema = z.enum(['info', 'warn', 'critical']);
export const DoorStatusSchema = z.enum(['OPEN', 'CLOSED', 'UNKNOWN']);
export const BeltStatusSchema = z.enum([
  'RUNNING_LOADED',
  'RUNNING_EMPTY',
  'STOPPED',
  'NO_TRUCK',
  'OFFLINE',
]);
export const BeltDirectionSchema = z.enum(['OUT', 'IN', 'NONE']);
export const DirectionSourceSchema = z.enum(['AUTO', 'WMS', 'CONFIG']);
export const VisitPhaseSchema = z.enum([
  'ARRIVED',
  'DOCKED',
  'LOADING',
  'UNLOADING',
  'FINISHED',
  'DEPARTED',
]);
export const EtaSourceSchema = z.enum(['HISTORICAL', 'WMS', 'NONE']);
export const CaptainIdSourceSchema = z.enum(['ROSTER', 'ROSTER+VEST', 'REID', 'UNCONFIRMED']);
export const CameraStatusSchema = z.enum(['OK', 'OFFLINE', 'OBSTRUCTED', 'DEFOCUS', 'MOVED']);
export const CameraRoleSchema = z.enum(['DOCK', 'CREW', 'BELT']);

// ActorsFrame (§3.3). `act` is an animation hint only; PHONE / IDLE are deliberately absent (privacy rule).
export const ActorKindSchema = z.enum(['PERSON', 'FORKLIFT']);
export const ActorRoleSchema = z.enum(['CAPTAIN', 'WORKER', 'FORKLIFT_OP', 'UNKNOWN']);
export const ActorActSchema = z.enum([
  'HANDLING',
  'SCANNING',
  'WALKING',
  'STATIONARY',
  'CARRYING',
  'DRIVING',
  'UNKNOWN',
]);

// CaseTick (§3.4)
export const CaseDirSchema = z.enum(['OUT', 'IN']);
export const PackTypeSchema = z.enum(['CASE', 'SACK', 'SHRINK']);
export const CaseFlagSchema = z.enum(['DAMAGED', 'OPEN_TAPE', 'TORN_SACK', 'WET_STAINED']);

// Events (§3.5, §3.6)
export const EventStatusSchema = z.enum(['OPEN', 'ACK', 'CLOSED']);
export const PpeItemSchema = z.enum(['vest', 'gloves', 'helmet', 'shoes']);

// REST (§4)
export const UiLangSchema = z.enum(['en', 'bn']);
export const RoleSchema = z.enum([
  'HQ_VIEWER',
  'DC_MANAGER',
  'SHIFT_SUPERVISOR',
  'SECURITY',
  'ADMIN',
  'KIOSK',
]);
export const SiteStatusSchema = z.enum(['ONLINE', 'DEGRADED', 'OFFLINE']);
export const VisitDirSchema = z.enum(['OUT', 'IN', 'MIXED']);
export const BucketSchema = z.enum(['hour', 'day']);
export const DwellGroupBySchema = z.enum(['bay', 'agency']);
export const LeaderboardPeriodSchema = z.enum(['shift', 'day', 'week', 'month']);
export const ExportFormatSchema = z.enum(['pdf', 'xlsx', 'csv']);
export const DirectionModeSchema = z.enum(['AUTO', 'INBOUND', 'OUTBOUND']);
export const EmployeeRoleSchema = z.enum(['CAPTAIN', 'WORKER', 'FORKLIFT_OP']);
export const AlertChannelSchema = z.enum(['TELEGRAM']);
