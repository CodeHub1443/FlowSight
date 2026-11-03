// Quality tiers (docs/02 section 6 rule 4, ADR-11, docs/06 section 2). High and Med get N8AO ambient occlusion and
// SMAA; Low has no post-processing at all and relies on contact shadows for grounding.

export type QualityTier = 'high' | 'med' | 'low';

export interface PostSettings {
  /** N8AO quality mode. */
  ao: 'performance' | 'low' | 'medium' | 'high';
  /** Render AO at half resolution (with depth-aware upsampling). */
  halfRes: boolean;
}

export interface QualitySettings {
  /** Allowed range of the device pixel ratio: the same clamp R3F applies to a `[min, max]` dpr. */
  dpr: [number, number];
  /**
   * Most pixels the canvas and the post-processing may render (the pixel budget). GPU cost scales with this, not with
   * the size of the wall: a bigger canvas renders at a lower ratio and the browser upscales it. See `renderPixelRatio`.
   */
  maxPixels: number;
  /** Directional light shadow map (PCF, softened by `shadow.radius`); `null` = no cast shadows. */
  shadowMapSize: number | null;
  /** Contact shadows under everything: render-target resolution and the highest re-render rate when invalidated. */
  contactShadows: { resolution: number; maxHz: number };
  /** `null` = no EffectComposer (Low). */
  post: PostSettings | null;
  /** Rounded-box smoothness for `hi` and `lo` detail items. */
  smoothness: { hi: number; lo: number };
  /** Radial segments for cylinders. */
  cylinderSegments: number;
  /** Dark-theme work lights (docs/06 section 8.3): a floor pool on every tier, plus real spot lights on `spot`. */
  workLights: 'spot' | 'decal';
  /**
   * People, forklifts, trucks and belt items (docs/04 section 4). `animated` false is the Low tier's simple static
   * figures: no limb or truck motion, no belt items, each actor placed on its latest frame.
   */
  actors: {
    animated: boolean;
    /** Capsule cap segments and radial segments, sphere segments. */
    capsule: [number, number];
    sphere: number;
  };
}

/**
 * Pixel budget tokens. Each sits just above a standard size, so that size and anything smaller render untouched:
 * Med 2.1 MP = 1920x1080 (2.07 MP), High 3.7 MP = 2560x1440 (3.69 MP).
 * Low = Med, not lower: at 1.0 MP a Low PC on a 1920x1080 or 1366x768 screen would render differently, and the 1080p
 * look is frozen. Measurements and the choice left to the owner: docs/PROGRESS.md, Task 17.
 */
export const MAX_PIXELS: Readonly<Record<QualityTier, number>> = {
  low: 2_100_000,
  med: 2_100_000,
  high: 3_700_000,
};

export const QUALITY: Record<QualityTier, QualitySettings> = {
  high: {
    dpr: [1, 2],
    maxPixels: MAX_PIXELS.high,
    // 4096: radius 6 is then a ~14 cm penumbra, so a 0.5 m crate still casts a visible soft shadow
    shadowMapSize: 4096,
    contactShadows: { resolution: 2048, maxHz: 8 },
    post: { ao: 'medium', halfRes: false },
    smoothness: { hi: 4, lo: 2 },
    cylinderSegments: 28,
    workLights: 'spot',
    actors: { animated: true, capsule: [3, 12], sphere: 14 },
  },
  med: {
    dpr: [1, 1.5],
    maxPixels: MAX_PIXELS.med,
    shadowMapSize: null,
    contactShadows: { resolution: 1024, maxHz: 4 },
    post: { ao: 'performance', halfRes: true },
    smoothness: { hi: 2, lo: 1 },
    cylinderSegments: 18,
    // seven spot lights cost about 15 % of the frame on Intel UHD (52 -> 45 fps, p95 24 -> 42 ms): High only
    workLights: 'decal',
    actors: { animated: true, capsule: [2, 7], sphere: 9 },
  },
  low: {
    dpr: [1, 1],
    maxPixels: MAX_PIXELS.low,
    shadowMapSize: null,
    contactShadows: { resolution: 1024, maxHz: 2 },
    post: null,
    smoothness: { hi: 1, lo: 1 },
    cylinderSegments: 12,
    workLights: 'decal',
    actors: { animated: false, capsule: [2, 6], sphere: 6 },
  },
};

export const TIER_ORDER: readonly QualityTier[] = ['low', 'med', 'high'];

/** First tier of the automatic mode; TierGovernor (tierGovernor.ts) steps it up or down from here. */
export const AUTO_START_TIER: QualityTier = 'med';

/**
 * Software rasterisers (GPU acceleration off, VMs, headless CI): no GPU to spend on AO, shadows or post. Exact names
 * only, so no real GPU or vendor string can match.
 */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|microsoft basic render driver/i;

/** First automatic tier for a WebGL renderer string (`UNMASKED_RENDERER_WEBGL`, or null when hidden). */
export function autoStartTier(renderer: string | null): QualityTier {
  return renderer && SOFTWARE_RENDERER.test(renderer) ? 'low' : AUTO_START_TIER;
}

export function stepTier(tier: QualityTier, delta: 1 | -1): QualityTier {
  const i = TIER_ORDER.indexOf(tier) + delta;
  return TIER_ORDER[Math.min(TIER_ORDER.length - 1, Math.max(0, i))] ?? tier;
}

export interface PixelRatioInput {
  /** The tier's allowed range of the device pixel ratio. */
  dpr: readonly [number, number];
  deviceDpr: number;
  /** CSS size of the canvas; zero or less while it is not laid out yet, when the budget cannot apply. */
  cssWidth: number;
  cssHeight: number;
  maxPixels: number;
}

/**
 * Pixel ratio of the renderer: the device ratio clamped to the tier's range (what R3F did on its own before the budget
 * existed), lowered only as far as `maxPixels` demands. The canvas keeps its CSS size whatever this returns.
 */
export function renderPixelRatio({
  dpr: [min, max],
  deviceDpr,
  cssWidth,
  cssHeight,
  maxPixels,
}: PixelRatioInput): number {
  const clamped = Math.min(Math.max(min, deviceDpr), max);
  const area = cssWidth * cssHeight;
  return area > 0 ? Math.min(clamped, Math.sqrt(maxPixels / area)) : clamped;
}

/** Dev tool `?pixels=<megapixels>`: replaces the tier's budget. Null when absent or not a positive number. */
export function parsePixelOverride(search: string): number | null {
  const raw = new URLSearchParams(search).get('pixels');
  if (raw === null || raw.trim() === '') return null;
  const mp = Number(raw);
  return Number.isFinite(mp) && mp > 0 ? mp * 1_000_000 : null;
}
