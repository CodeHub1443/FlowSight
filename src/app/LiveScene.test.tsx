import { act, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import type { WebGLRenderer } from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { SCENE_SAFE_AREA } from '@/scene/camera/view';
import type { SceneRootProps } from '@/scene';
import { uiStore } from '@/stores';
import { LiveScene } from './LiveScene';

// The /live adapter: SceneRoot gets the overlay safe area, automatic quality until uiStore sets a tier, and the
// labels flag. The lazy scene chunk is replaced by a stand-in that records its props (no WebGL in jsdom).

const seen: SceneRootProps[] = [];
/** UNMASKED_RENDERER_WEBGL the stub's renderer reports. */
let rendererName = 'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)';

const fakeGl = () =>
  ({
    getContext: () => ({
      getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1 }),
      getParameter: () => rendererName,
    }),
  }) as unknown as WebGLRenderer;

function SceneRootStub(props: SceneRootProps) {
  seen.push(props);
  const { onReady } = props;
  useEffect(() => onReady?.(fakeGl(), {} as Parameters<NonNullable<typeof onReady>>[1]), [onReady]);
  return <div data-testid="scene-root-stub" />;
}

vi.mock('@/scene', () => ({ SceneRoot: SceneRootStub }));
vi.mock('./webgl', () => ({ hasWebGL: () => true }));

const last = () => seen[seen.length - 1];

describe('LiveScene', () => {
  beforeEach(() => {
    seen.length = 0;
    window.history.replaceState(null, '', '/live');
    uiStore.getState().setQuality('auto');
  });

  it('frames the scene inside SCENE_SAFE_AREA and starts in automatic quality', async () => {
    render(<LiveScene />);
    await screen.findByTestId('scene-root-stub');
    expect(last()?.safeArea).toBe(SCENE_SAFE_AREA);
    expect(last()?.quality).toBeUndefined();
    expect(last()?.labels).toBe(true);
  });

  it('pins the tier while uiStore holds one, including the auto start tier (manual override)', async () => {
    render(<LiveScene />);
    await screen.findByTestId('scene-root-stub');
    act(() => uiStore.getState().setQuality('med'));
    expect(last()?.quality).toBe('med');
    act(() => uiStore.getState().setQuality('auto'));
    expect(last()?.quality).toBeUndefined();
  });

  it('drops the blur in automatic mode when a software rasteriser starts the scene at Low', async () => {
    rendererName =
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)';
    try {
      render(<LiveScene />);
      await screen.findByTestId('scene-root-stub');
      expect(last()?.quality).toBeUndefined();
      expect(document.documentElement.dataset.quality).toBe('low');
    } finally {
      rendererName = 'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)';
    }
  });

  it('marks the document on the Low tier so the cards drop their backdrop blur', async () => {
    const { unmount } = render(<LiveScene />);
    await screen.findByTestId('scene-root-stub');
    expect(document.documentElement.dataset.quality).toBeUndefined();
    act(() => uiStore.getState().setQuality('low'));
    expect(document.documentElement.dataset.quality).toBe('low');
    act(() => uiStore.getState().setQuality('high'));
    expect(document.documentElement.dataset.quality).toBeUndefined();
    act(() => uiStore.getState().setQuality('low'));
    unmount();
    expect(document.documentElement.dataset.quality).toBeUndefined();
  });

  it('pins the tier from ?quality=', async () => {
    window.history.replaceState(null, '', '/live?quality=low');
    render(<LiveScene />);
    await screen.findByTestId('scene-root-stub');
    expect(last()?.quality).toBe('low');
  });
});
