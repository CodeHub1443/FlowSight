import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createMaterials, LIGHT_PALETTE } from './materials';
import { QUALITY, type QualityTier } from './quality';
import { SceneEnvContext, type SceneEnv } from './sceneEnv';
import { ScenePost } from './ScenePost';
import { POST_TONE_MODE } from './toneMapping';

// ADR-11 / docs/06 section 2: N8AO + SMAA on High and Med, no EffectComposer at all on Low. The effect components
// are replaced by DOM stand-ins that record what would be mounted (no WebGL in jsdom).

vi.mock('@react-three/postprocessing', () => ({
  EffectComposer: ({ children }: { children: ReactNode }) => (
    <div data-testid="composer">{children}</div>
  ),
  N8AO: (p: { quality: string; halfRes: boolean }) => (
    <i data-testid="n8ao" data-quality={p.quality} data-half={String(p.halfRes)} />
  ),
  SMAA: () => <i data-testid="smaa" />,
  ToneMapping: (p: { mode: number }) => <i data-testid="tone" data-mode={p.mode} />,
}));

function envFor(tier: QualityTier): SceneEnv {
  return {
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
});
