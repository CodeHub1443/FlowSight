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
  dpr: [number, number];
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
}

export const QUALITY: Record<QualityTier, QualitySettings> = {
  high: {
    dpr: [1, 2],
    // 4096: radius 6 is then a ~14 cm penumbra, so a 0.5 m crate still casts a visible soft shadow
    shadowMapSize: 4096,
    contactShadows: { resolution: 2048, maxHz: 8 },
    post: { ao: 'medium', halfRes: false },
    smoothness: { hi: 4, lo: 2 },
    cylinderSegments: 28,
    workLights: 'spot',
  },
  med: {
    dpr: [1, 1.5],
    shadowMapSize: null,
    contactShadows: { resolution: 1024, maxHz: 4 },
    post: { ao: 'performance', halfRes: true },
    smoothness: { hi: 2, lo: 1 },
    cylinderSegments: 18,
    // seven spot lights cost about 15 % of the frame on Intel UHD (52 -> 45 fps, p95 24 -> 42 ms): High only
    workLights: 'decal',
  },
  low: {
    dpr: [1, 1],
    shadowMapSize: null,
    contactShadows: { resolution: 1024, maxHz: 2 },
    post: null,
    smoothness: { hi: 1, lo: 1 },
    cylinderSegments: 12,
    workLights: 'decal',
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
