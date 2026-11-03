import { useCallback, useSyncExternalStore } from 'react';
import { parsePixelOverride, renderPixelRatio, type QualitySettings } from './quality';
import { QUALITY_DEBUG } from './qualityProbe';

/** Calls back when the device pixel ratio changes (browser zoom, another display), which a resize alone can miss. */
function watchDevicePixelRatio(cb: () => void): () => void {
  let media: MediaQueryList | null = null;
  const onChange = () => {
    arm();
    cb();
  };
  const arm = () => {
    media?.removeEventListener('change', onChange);
    media = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    media.addEventListener('change', onChange);
  };
  arm();
  return () => media?.removeEventListener('change', onChange);
}

/**
 * The renderer's pixel ratio for a canvas filling `frame` (`renderPixelRatio`). A primitive read from the DOM on demand,
 * so a resize re-renders the scene only if the ratio really moved: never at sizes below the budget.
 */
export function useRenderPixelRatio(
  frame: HTMLElement | null,
  { dpr, maxPixels }: Pick<QualitySettings, 'dpr' | 'maxPixels'>,
): number {
  const subscribe = useCallback(
    (cb: () => void) => {
      const resize = frame ? new ResizeObserver(cb) : null;
      if (frame) resize?.observe(frame);
      const unwatch = watchDevicePixelRatio(cb);
      return () => {
        resize?.disconnect();
        unwatch();
      };
    },
    [frame],
  );
  return useSyncExternalStore(subscribe, () =>
    renderPixelRatio({
      dpr,
      deviceDpr: window.devicePixelRatio,
      cssWidth: frame?.clientWidth ?? 0,
      cssHeight: frame?.clientHeight ?? 0,
      maxPixels: (QUALITY_DEBUG ? parsePixelOverride(window.location.search) : null) ?? maxPixels,
    }),
  );
}
