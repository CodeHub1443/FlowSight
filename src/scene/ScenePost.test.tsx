import { render, screen } from '@testing-library/react';
import { useLayoutEffect, type ReactNode, type Ref } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createMaterials, LIGHT_PALETTE } from './materials';
import { QUALITY, type QualityTier } from './quality';
import { SceneEnvContext, type SceneEnv } from './sceneEnv';
import { ScenePost } from './ScenePost';
import { POST_TONE_MODE } from './toneMapping';

// ADR-11 / docs/06 section 2: N8AO + SMAA on High and Med, no EffectComposer at all on Low. The effect components
// are replaced by DOM stand-ins that record what would be mounted (no WebGL in jsdom).

/** Stands in for the N8AOPostPass: one full-screen quad, the shape n8ao gives its quads (render, dispose, material). */
const aoPass = vi.hoisted(() => ({
  copyQuad: { render: vi.fn(), dispose: vi.fn(), material: {} },
}));

vi.mock('@react-three/postprocessing', () => ({
  EffectComposer: ({ children }: { children: ReactNode }) => (
    <div data-testid="composer">{children}</div>
  ),
  // hands the pass to the ref the way R3F's <primitive ref> does, cleanup included (React 19 callback refs)
  N8AO: function N8AO(p: { quality: string; halfRes: boolean; ref?: Ref<object> }) {
    const { ref } = p;
    useLayoutEffect(() => {
      if (typeof ref !== 'function') return;
      const cleanup = ref(aoPass);
      return () => {
        if (typeof cleanup === 'function') cleanup();
        else ref(null);
      };
    }, [ref]);
    return <i data-testid="n8ao" data-quality={p.quality} data-half={String(p.halfRes)} />;
  },
  SMAA: () => <i data-testid="smaa" />,
  ToneMapping: (p: { mode: number }) => <i data-testid="tone" data-mode={p.mode} />,
}));

function envFor(tier: QualityTier): SceneEnv {
  return {
    theme: 'light',
    palette: LIGHT_PALETTE,
    materials: createMaterials(LIGHT_PALETTE),
    tier,
    quality: QUALITY[tier],
    shadows: QUALITY[tier].shadowMapSize !== null,
    toneMapping: 'neutral',
  };
}

function mount(tier: QualityTier) {
  return render(
    <SceneEnvContext.Provider value={envFor(tier)}>
      <ScenePost />
    </SceneEnvContext.Provider>,
  );
}

describe('ScenePost', () => {
  it('mounts no EffectComposer on Low', () => {
    const { container } = mount('low');
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('composer')).toBeNull();
    expect(QUALITY.low.post).toBeNull();
  });

  it.each(['high', 'med'] as const)('mounts N8AO, SMAA and the tone mapping on %s', (tier) => {
    mount(tier);
    expect(screen.getByTestId('composer')).toBeInTheDocument();
    expect(screen.getByTestId('n8ao')).toHaveAttribute('data-quality', QUALITY[tier].post?.ao);
    expect(screen.getByTestId('smaa')).toBeInTheDocument();
    expect(screen.getByTestId('tone')).toHaveAttribute('data-mode', String(POST_TONE_MODE.neutral));
  });

  it('runs AO at half resolution on Med only', () => {
    mount('med');
    expect(screen.getByTestId('n8ao')).toHaveAttribute('data-half', 'true');
  });

  // Task 21: n8ao's quads share a module-level geometry that keeps every renderer that drew the AO alive
  it('releases the AO quads when the pass goes, and not on a re-render', () => {
    aoPass.copyQuad.dispose.mockClear();
    const view = mount('med');
    view.rerender(
      <SceneEnvContext.Provider value={envFor('med')}>
        <ScenePost />
      </SceneEnvContext.Provider>,
    );
    expect(aoPass.copyQuad.dispose).not.toHaveBeenCalled();
    view.unmount();
    expect(aoPass.copyQuad.dispose).toHaveBeenCalledTimes(1);
  });
});
