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

vi.mock('@/scene', () => ({
  SceneRoot: (props: SceneRootProps) => {
    seen.push(props);
    return <div data-testid="scene-root-stub" />;
  },
}));
vi.mock('./webgl', () => ({ hasWebGL: () => true }));

const last = () => seen[seen.length - 1];

describe('LiveScene', () => {
  beforeEach(() => {
    seen.length = 0;
    window.history.replaceState(null, '', '/live');
  });

  it('frames the scene inside SCENE_SAFE_AREA and starts in automatic quality', async () => {
    render(<LiveScene />);
    await screen.findByTestId('scene-root-stub');
    expect(last()?.safeArea).toBe(SCENE_SAFE_AREA);
    expect(last()?.quality).toBeUndefined();
    expect(last()?.labels).toBe(true);
  });

  it('pins the tier once uiStore.setQuality is called (manual override)', async () => {
    render(<LiveScene />);
    await screen.findByTestId('scene-root-stub');
    const other = uiStore.getState().quality === 'low' ? 'high' : 'low';
    act(() => uiStore.getState().setQuality(other));
    expect(last()?.quality).toBe(other);
  });

  it('pins the tier from ?quality=', async () => {
    window.history.replaceState(null, '', '/live?quality=low');
    render(<LiveScene />);
    await screen.findByTestId('scene-root-stub');
    expect(last()?.quality).toBe('low');
  });
});
