import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { SCENE_SAFE_AREA } from '@/scene/camera/view';
import type { SceneRootProps } from '@/scene';
import { uiStore } from '@/stores';
import { LiveScene } from './LiveScene';

// The /live adapter: SceneRoot gets the overlay safe area, automatic quality until uiStore sets a tier, and the
// labels flag. The lazy scene chunk is replaced by a stand-in that records its props (no WebGL in jsdom).

const seen: SceneRootProps[] = [];

function SceneRootStub(props: SceneRootProps) {
  seen.push(props);
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

  it('follows the automatic tier for the card blur, in both directions', async () => {
    render(<LiveScene />);
    await screen.findByTestId('scene-root-stub');
    expect(last()?.quality).toBeUndefined();
    expect(document.documentElement.dataset.quality).toBeUndefined();
    act(() => last()?.onTierChange?.('low'));
    expect(document.documentElement.dataset.quality).toBe('low');
    act(() => last()?.onTierChange?.('med'));
    expect(document.documentElement.dataset.quality).toBeUndefined();
  });

  it('shows the dev tier badge, following the tier', async () => {
    render(<LiveScene />);
    await screen.findByTestId('scene-root-stub');
    expect(screen.getByTestId('quality-badge').dataset.tier).toBe('med');
    act(() => last()?.onTierChange?.('high'));
    expect(screen.getByTestId('quality-badge').dataset.tier).toBe('high');
    act(() => uiStore.getState().setQuality('low'));
    expect(screen.getByTestId('quality-badge').dataset.tier).toBe('low');
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

  it('forces the automatic mode from ?quality=auto over a tier in uiStore', async () => {
    window.history.replaceState(null, '', '/live?quality=auto');
    uiStore.getState().setQuality('low');
    render(<LiveScene />);
    await screen.findByTestId('scene-root-stub');
    expect(last()?.quality).toBeUndefined();
  });
});
