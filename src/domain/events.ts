import { z } from 'zod';
import {
  ActorRoleSchema,
  BeltStatusSchema,
  CaseDirSchema,
  EventStatusSchema,
  PackTypeSchema,
  PpeItemSchema,
  SeveritySchema,
  VisitPhaseSchema,
} from './enums';
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
  IsoTsSchema,
  LangSchema,
  NonNegSchema,
  VersionSchema,
} from './primitives';
import { failure, failureFromZod, issuesOf, type ParseIssue, type ParseResult } from './result';

// WhEvent, docs/03 section 3.5. One registry entry per catalogue row: `category.type`, default severity, `data` schema.

const baseShape = {
  v: VersionSchema,
  id: UlidSchema,
  ts: IsoTsSchema,
  site: SiteIdSchema,
  bay: BayIdSchema.nullable(),
  sev: SeveritySchema,
  title: LangSchema,
  src: z.object({ cam: CameraIdSchema, model: z.string(), conf: ConfSchema }),
  refs: z.object({
    visitId: VisitIdSchema.nullable(),
    trackId: TrackIdSchema.nullable(),
    sku: SkuCodeSchema.nullable(),
    plateEn: z.string().nullable(),
  }),
  media: z
    .object({
      snapshotKey: z.string().min(1),
      clipKey: z.string().min(1).nullable(),
      // [x, y, w, h] in source-frame pixels
      bbox: z.tuple([NonNegSchema, NonNegSchema, NonNegSchema, NonNegSchema]),
      frameW: z.number().int().positive(),
      frameH: z.number().int().positive(),
    })
    .nullable(),
  pos: z.object({ x: z.number(), y: z.number() }).nullable(),
};

function defineEvent<C extends string, T extends string, D extends z.ZodType>(
  category: C,
  type: T,
  sev: z.infer<typeof SeveritySchema>,
  data: D,
) {
  return {
    key: `${category}.${type}` as const,
    category,
    type,
    sev,
    data,
    schema: z.object({
      ...baseShape,
      category: z.literal(category),
      type: z.literal(type),
      data,
    }),
  };
}

const visitAt = z.object({ visitId: VisitIdSchema, plateEn: z.string(), at: IsoTsSchema });
const skuPack = z.object({ sku: SkuCodeSchema.nullable(), pack: PackTypeSchema });
const cam = z.object({ cam: CameraIdSchema });
const areaM2 = z.object({ areaM2: NonNegSchema.nullable() });

/** Every row of the section 3.5 catalogue, in catalogue order. */
export const EVENT_REGISTRY = [
  defineEvent('truck', 'arrived', 'info', visitAt),
  defineEvent('truck', 'docked', 'info', visitAt),
  defineEvent('truck', 'started', 'info', visitAt.extend({ dir: CaseDirSchema })),
  defineEvent(
    'truck',
    'finished',
    'info',
    visitAt.extend({ casesOut: CountSchema, casesIn: CountSchema }),
  ),
  defineEvent('truck', 'departed', 'info', visitAt.extend({ tatMin: NonNegSchema })),
  defineEvent(
    'truck',
    'detention',
    'warn',
    z.object({
      visitId: VisitIdSchema,
      phase: VisitPhaseSchema,
      minutes: NonNegSchema,
      thresholdMin: NonNegSchema,
    }),
  ),
  defineEvent(
    'truck',
    'unknown_plate',
    'warn',
    z.object({ plateBn: z.string(), plateEn: z.string(), conf: ConfSchema }),
  ),
  defineEvent(
    'belt',
    'state_changed',
    'info',
    z.object({ from: BeltStatusSchema, to: BeltStatusSchema }),
  ),
  defineEvent('belt', 'empty_run', 'warn', z.object({ minutes: NonNegSchema })),
  defineEvent('belt', 'fall_off', 'warn', skuPack),
  defineEvent('hygiene', 'damaged', 'warn', skuPack),
  defineEvent('hygiene', 'open_tape', 'warn', skuPack),
  defineEvent('hygiene', 'torn_sack', 'warn', skuPack),
  defineEvent('hygiene', 'wet_stained', 'warn', skuPack),
  defineEvent('hygiene', 'spillage', 'info', areaM2),
  defineEvent('hygiene', 'debris', 'info', areaM2),
  defineEvent(
    'handling',
    'rough_handling',
    'warn',
    z.object({ trackId: TrackIdSchema.nullable(), dropHeightM: NonNegSchema.nullable() }),
  ),
  defineEvent(
    'ppe',
    'violation',
    'warn',
    z.object({
      trackId: TrackIdSchema.nullable(),
      role: ActorRoleSchema,
      missing: z.array(PpeItemSchema),
    }),
  ),
  defineEvent('compliance', 'on_belt', 'critical', z.object({ trackId: TrackIdSchema.nullable() })),
  defineEvent(
    'compliance',
    'crowding',
    'warn',
    z.object({ count: CountSchema, limit: CountSchema }),
  ),
  defineEvent(
    'compliance',
    'forklift_proximity',
    'critical',
    z.object({
      trackId: TrackIdSchema.nullable(),
      forkliftId: TrackIdSchema,
      distM: NonNegSchema,
    }),
  ),
  defineEvent(
    'roster',
    'captain_detected',
    'info',
    z.object({ employeeId: EmployeeIdSchema.nullable(), trackId: TrackIdSchema.nullable() }),
  ),
  defineEvent(
    'roster',
    'captain_absent',
    'warn',
    z.object({ employeeId: EmployeeIdSchema.nullable(), minutes: NonNegSchema }),
  ),
  defineEvent(
    'staging',
    'pallet_wait',
    'warn',
    z.object({ palletsWaiting: CountSchema, oldestWaitSec: NonNegSchema }),
  ),
  defineEvent('security', 'after_hours_presence', 'critical', z.object({ count: CountSchema })),
  defineEvent('security', 'door_open_idle', 'warn', z.object({ minutes: NonNegSchema })),
  defineEvent(
    'security',
    'truck_entry_no_loading',
    'warn',
    z.object({ trackId: TrackIdSchema.nullable() }),
  ),
  defineEvent('system', 'camera_offline', 'critical', cam),
  defineEvent('system', 'camera_obstructed', 'warn', cam),
  defineEvent('system', 'camera_defocus', 'warn', cam),
  defineEvent('system', 'camera_moved', 'warn', cam),
  defineEvent('system', 'camera_ok', 'info', cam),
  defineEvent('system', 'pipeline_lag', 'warn', z.object({ lagMs: NonNegSchema })),
] as const;

export type EventRegistryEntry = (typeof EVENT_REGISTRY)[number];
export type EventKey = EventRegistryEntry['key'];

export const EVENT_KEYS: readonly EventKey[] = EVENT_REGISTRY.map((e) => e.key);

/** A validated event; narrow on `category` + `type` to get a typed `data`. */
export type WhEvent = z.infer<EventRegistryEntry['schema']>;

/** Default severity for a catalogue row (rules may override it on the wire). */
export function defaultSeverity(key: EventKey): z.infer<typeof SeveritySchema> {
  for (const entry of EVENT_REGISTRY) {
    if (entry.key === key) return entry.sev;
  }
  throw new Error(`unreachable: ${key}`);
}

const envelope = z.object({ category: z.string(), type: z.string() });

/** Validate one event. Unknown `category.type` is invalid (closed catalogue). Never throws. */
export function parseWhEvent(raw: unknown): ParseResult<WhEvent> {
  const env = envelope.safeParse(raw);
  if (!env.success) return failureFromZod(env.error);
  const { category, type } = env.data;
  const entry = EVENT_REGISTRY.find((e) => e.category === category && e.type === type);
  if (!entry) {
    return failure('UNKNOWN_EVENT_TYPE', `unknown event type ${category}.${type}`, [
      { path: 'type', message: `${category}.${type} is not in the event catalogue` },
    ]);
  }
  const result = entry.schema.safeParse(raw);
  return result.success ? { ok: true, value: result.data } : failureFromZod(result.error);
}

/** NATS subject of an event: `wh.{site}.evt.{category}.{type}`. */
export function subjectFor(event: Pick<WhEvent, 'site' | 'category' | 'type'>): string {
  return `wh.${event.site}.evt.${event.category}.${event.type}`;
}

/** The binding rule of section 3.5: site/category/type of the payload must match the subject it arrived on. */
export function subjectMatchesEvent(
  subject: string,
  event: Pick<WhEvent, 'site' | 'category' | 'type'>,
): boolean {
  return subject === subjectFor(event);
}

/** Validate an event received on `subject`, enforcing the subject and payload rule. */
export function parseWhEventFromSubject(subject: string, raw: unknown): ParseResult<WhEvent> {
  const parsed = parseWhEvent(raw);
  if (!parsed.ok) return parsed;
  if (!subjectMatchesEvent(subject, parsed.value)) {
    return failure(
      'SUBJECT_MISMATCH',
      `subject ${subject} does not match payload ${subjectFor(parsed.value)}`,
    );
  }
  return parsed;
}

function toCtxIssues(issues: ParseIssue[], fallback: string) {
  return (issues.length ? issues : [{ path: '', message: fallback }]).map((issue) => ({
    path: issue.path ? issue.path.split('.') : [],
    message: issue.message,
  }));
}

/** Schema form of {@link parseWhEvent}, for use inside Page<T>, snapshot and replay shapes. */
export const WhEventSchema = z.unknown().transform((raw, ctx): WhEvent => {
  const result = parseWhEvent(raw);
  if (result.ok) return result.value;
  for (const issue of toCtxIssues(result.error.issues, result.error.message)) {
    ctx.issues.push({ code: 'custom', input: raw, ...issue });
  }
  return z.NEVER;
});

// WhEventWithStatus, docs/03 section 4.1: WhEvent & { status, ack, closed, notes }.
const eventStatusFields = z.object({
  status: EventStatusSchema,
  ack: z.object({ by: z.string(), at: IsoTsSchema }).nullable(),
  closed: z.object({ by: z.string(), at: IsoTsSchema, note: z.string() }).nullable(),
  notes: z.array(z.object({ by: z.string(), at: IsoTsSchema, text: z.string() })),
});

export type WhEventStatusFields = z.infer<typeof eventStatusFields>;
export type WhEventWithStatus = WhEvent & WhEventStatusFields;

export const WhEventWithStatusSchema = z.unknown().transform((raw, ctx): WhEventWithStatus => {
  const event = parseWhEvent(raw);
  const status = eventStatusFields.safeParse(raw);
  if (event.ok && status.success) return { ...event.value, ...status.data };
  const issues = [
    ...(event.ok ? [] : event.error.issues),
    ...(status.success ? [] : issuesOf(status.error)),
  ];
  for (const issue of toCtxIssues(issues, 'invalid event')) {
    ctx.issues.push({ code: 'custom', input: raw, ...issue });
  }
  return z.NEVER;
});
