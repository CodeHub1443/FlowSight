import { renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { BufferGeometry, Mesh, MeshBasicMaterial, Scene, type WebGLRenderer } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReleaseOnUnmount } from './useReleaseOnUnmount';

// Task 21: SceneRoot releases the renderer's shared resources on a real unmount, never on StrictMode's simulated one.

const gl = { properties: { get: () => ({}) } } as unknown as WebGLRenderer;

function sceneWith(geometry: BufferGeometry): Scene {
  const scene = new Scene();
  scene.add(new Mesh(geometry, new MeshBasicMaterial()));
  return scene;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useReleaseOnUnmount', () => {
  it('disposes the scene resources a task after a real unmount', () => {
    const geometry = new BufferGeometry();
    const dispose = vi.spyOn(geometry, 'dispose');
    const { result, unmount } = renderHook(() => useReleaseOnUnmount());
    result.current.current = { gl, scene: sceneWith(geometry) };
    unmount();
    expect(dispose).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(result.current.current).toBeNull();
  });

  it('disposes nothing while mounted under StrictMode', () => {
    const geometry = new BufferGeometry();
    const dispose = vi.spyOn(geometry, 'dispose');
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { result, rerender } = renderHook(() => useReleaseOnUnmount(), { wrapper });
    result.current.current = { gl, scene: sceneWith(geometry) };
    rerender();
    vi.runAllTimers();
    expect(dispose).not.toHaveBeenCalled();
  });

  it('does nothing when the canvas was never created', () => {
    const { unmount } = renderHook(() => useReleaseOnUnmount());
    unmount();
    expect(() => vi.runAllTimers()).not.toThrow();
  });
});
