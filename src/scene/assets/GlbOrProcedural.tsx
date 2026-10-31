import { Component, Suspense, type ReactNode } from 'react';
import type { BoxItem } from '../items';
import { BoxInstances } from '../primitives';
import { useSceneEnv } from '../sceneEnv';

/** A GLB that fails to load must not take the scene down: its procedural props stay. */
export class ModelBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * GLB props on High and Med, the procedural ones (`procedural`) on Low, while the file loads and if it cannot load
 * (ADR-13). The two versions share a layout, so nothing moves when one replaces the other.
 */
export function GlbOrProcedural({
  procedural,
  children,
}: {
  procedural: readonly BoxItem[];
  children: ReactNode;
}) {
  const { tier } = useSceneEnv();
  const fallback = <BoxInstances items={procedural} cast />;
  if (tier === 'low') return fallback;
  return (
    <ModelBoundary fallback={fallback}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </ModelBoundary>
  );
}
