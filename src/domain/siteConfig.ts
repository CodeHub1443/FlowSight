import { z } from 'zod';
import { DirectionModeSchema, CameraRoleSchema } from './enums';
import { BayIdSchema, SiteIdSchema } from './ids';
import { HHmmSchema, LangSchema, NonNegSchema } from './primitives';

// SiteConfig: the shape of config/sites/<siteId>.json (docs/03 section 4.2 `GET /sites/{site}/config`).
// Free-text `note` fields are commentary in the file and optional here.

const note = z.string().optional();
const range = z.tuple([z.number(), z.number()]);
const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'hex colour');
const faceSchema = z.enum(['N', 'S', 'E', 'W']);

export const ThresholdsSchema = z.object({
  detentionMin: NonNegSchema,
  waitToStartMin: NonNegSchema,
  emptyRunMin: NonNegSchema,
  finishedGapMin: NonNegSchema,
  crowdingCount: NonNegSchema,
  palletWaitSec: NonNegSchema,
  doorOpenIdleMin: NonNegSchema,
  staleBaySec: NonNegSchema,
});

/** A shift window: wall-clock `HH:mm` in the site time zone; `end <= start` means it crosses midnight. */
export const ShiftWindowSchema = z.object({
  id: z.string().min(1),
  start: HHmmSchema,
  end: HHmmSchema,
});

export const SiteConfigBaySchema = z.object({
  id: BayIdSchema,
  label: LangSchema,
  conveyor: z.string(),
  directionMode: DirectionModeSchema,
});

const contextItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('road'),
    name: z.string(),
    side: faceSchema,
    lanes: z.number().int().positive(),
    offset: z.number(),
  }),
  z.object({
    type: z.literal('building'),
    side: faceSchema,
    offset: z.number(),
    size: z.tuple([z.number(), z.number(), z.number()]),
    detail: z.string(),
  }),
  z.object({
    type: z.literal('trees'),
    side: faceSchema,
    count: z.number().int().nonnegative(),
  }),
]);

export const SiteConfigSchema = z.object({
  id: SiteIdSchema,
  name: LangSchema,
  org: z.string(),
  timezone: z.string().min(1),
  geo: z.object({ lat: z.number(), lng: z.number(), note }),
  units: z.literal('m'),
  building: z.object({
    footprint: z.object({ widthEW: NonNegSchema, depthNS: NonNegSchema }),
    eaveHeight: NonNegSchema,
    roof: z.object({
      type: z.string(),
      ridges: z.number().int().positive(),
      ridgeAxis: z.enum(['NS', 'EW']),
      pitchDeg: NonNegSchema,
    }),
    facade: z.object({
      face: faceSchema,
      pattern: z.string(),
      colors: z.array(hexColor),
      stripeWidth: NonNegSchema,
      note,
    }),
    floorLevel: NonNegSchema,
  }),
  dockFaces: z.array(
    z.object({
      face: faceSchema,
      canopyDepth: NonNegSchema,
      doorPitch: NonNegSchema,
      door: z.object({ width: NonNegSchema, height: NonNegSchema }),
      bayOrder: z.string(),
      bays: z.array(SiteConfigBaySchema),
      note,
    }),
  ),
  bayInterior: z.object({
    conveyor: z.object({
      fixedFrom: z.number(),
      fixedTo: z.number(),
      boomMaxReach: NonNegSchema,
      width: NonNegSchema,
      note,
    }),
    workZone: z.object({ x: range, y: range }),
    staging: z.object({ x: range, y: range }),
    forkliftAisle: z.object({ y: range }),
    storage: z.object({ y: range }),
  }),
  cameraTemplate: z.array(
    z.object({
      role: CameraRoleSchema,
      mount: z.object({ x: z.number(), y: z.number(), z: z.number() }),
      looks: z.string(),
    }),
  ),
  yard: z.object({
    depth: NonNegSchema,
    guideLineLength: NonNegSchema,
    holdingLane: z.object({ slots: z.number().int().nonnegative(), alongBoundary: z.boolean() }),
    gate: z.object({ position: z.string(), width: NonNegSchema, guardBooth: z.boolean() }),
  }),
  boundary: z.object({ style: z.string(), height: NonNegSchema }),
  context: z.array(contextItemSchema),
  thresholds: ThresholdsSchema,
  shiftsPlaceholder: z.array(ShiftWindowSchema),
  businessDayStart: HHmmSchema,
  privacy: z.object({ showCaptainNames: z.boolean() }),
});
