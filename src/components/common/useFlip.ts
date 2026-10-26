import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * FLIP for a list (docs/06 §4): children carrying `data-flip-key` glide to their new position (200 ms ease-out)
 * when rows are inserted above them or removed, instead of jumping. New rows fade in. Runs after every commit, reads
 * each row's offset once and animates only `transform` / `opacity`, so it never causes a React render.
 */
export function useFlip(listRef: RefObject<HTMLElement | null>): void {
  const tops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const prev = tops.current;
    const next = new Map<string, number>();
    const hadRows = prev.size > 0;
    for (const el of list.querySelectorAll<HTMLElement>(':scope > [data-flip-key]')) {
      const key = el.dataset.flipKey ?? '';
      const top = el.offsetTop;
      next.set(key, top);
      if (typeof el.animate !== 'function') continue;
      const before = prev.get(key);
      if (before !== undefined && before !== top) {
        el.animate(
          [{ transform: `translateY(${before - top}px)` }, { transform: 'translateY(0)' }],
          { duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        );
      } else if (before === undefined && hadRows) {
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
      }
    }
    tops.current = next;
  });
}
