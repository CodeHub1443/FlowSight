// Quality tiers (docs/02 section 6, rule 4). No SSAO or postprocessing (ADR-10).

export type QualityTier = 'high' | 'med' | 'low';

export interface QualitySettings {
  dpr: [number, number];
  /** Directional light shadow map (soft PCF); `null` = no cast shadows. */
  shadowMapSize: number | null;
  /** Baked contact shadows under the equipment. */
  contactShadows: boolean;
}

export const QUALITY: Record<QualityTier, QualitySettings> = {
  high: { dpr: [1, 2], shadowMapSize: 2048, contactShadows: true },
  med: { dpr: [1, 1.5], shadowMapSize: null, contactShadows: true },
  low: { dpr: [1, 1], shadowMapSize: null, contactShadows: false },
};

export const TIER_ORDER: readonly QualityTier[] = ['low', 'med', 'high'];

export function stepTier(tier: QualityTier, delta: 1 | -1): QualityTier {
  const i = TIER_ORDER.indexOf(tier) + delta;
  return TIER_ORDER[Math.min(TIER_ORDER.length - 1, Math.max(0, i))] ?? tier;
}
