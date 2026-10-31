import { useFrame } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useRef } from 'react';
import { ModelBoundary } from './assets/GlbOrProcedural';
import { useModel } from './assets/loader';
import { LIVE_MODELS, type ModelName } from './assets/models';
import { TierGovernor } from './tierGovernor';
import type { QualityTier } from './quality';
import { QUALITY_DEBUG, qualityProbe } from './qualityProbe';

function ModelSettled({ name, onSettled }: { name: ModelName; onSettled: (n: ModelName) => void }) {
  useModel(name);
  useEffect(() => onSettled(name), [name, onSettled]);
  return null;
}

function ModelFailed({ name, onSettled }: { name: ModelName; onSettled: (n: ModelName) => void }) {
  useEffect(() => onSettled(name), [name, onSettled]);
  return null;
}

/**
 * Drives TierGovernor from the render loop while the tier is automatic. The tier is React state only when it steps,
 * never per frame. The model watchers share useLoader's cache with the props, so they fetch nothing extra.
 */
export function AutoQuality({
  tier,
  onStep,
}: {
  tier: QualityTier;
  onStep: (tier: QualityTier) => void;
}) {
  const governor = useRef<TierGovernor | null>(null);
  const settled = useRef(new Set<ModelName>());
  const onSettled = useCallback((name: ModelName) => void settled.current.add(name), []);

  useEffect(() => {
    // a tier from outside: SceneRoot's software-renderer start. A step of our own already matches.
    if (governor.current?.tier !== tier) governor.current = null;
  }, [tier]);

  useEffect(
    () => () => {
      qualityProbe.state = 'pinned';
      qualityProbe.fps = null;
    },
    [],
  );

  useFrame(() => {
    const now = performance.now();
    const g = (governor.current ??= new TierGovernor(tier, now));
    const active = document.visibilityState === 'visible' && document.hasFocus();
    const ready = g.tier === 'low' || settled.current.size === LIVE_MODELS.length;
    const override = QUALITY_DEBUG ? window.__qualityFpsOverride : null;
    const step = g.frame(now, active, ready, override);
    if (QUALITY_DEBUG) {
      qualityProbe.state = g.state;
      qualityProbe.fps = g.fps;
    }
    if (!step) return;
    if (QUALITY_DEBUG) {
      qualityProbe.steps.push(step);
      console.info(
        `[quality] ${step.from} -> ${step.to}: ${step.reason} (${step.fps.toFixed(0)} fps) at ${Math.round(step.at)} ms`,
      );
    }
    onStep(step.to);
  });

  if (tier === 'low') return null;
  return (
    <>
      {LIVE_MODELS.map((name) => (
        <ModelBoundary key={name} fallback={<ModelFailed name={name} onSettled={onSettled} />}>
          <Suspense fallback={null}>
            <ModelSettled name={name} onSettled={onSettled} />
          </Suspense>
        </ModelBoundary>
      ))}
    </>
  );
}
