import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { DEFAULT_PERF_RANGE, parseRange, RANGE_PARAM, type PerfRange } from '@/lib/period';

/** The analytics range from the URL (`?range=shift|day|week`, default day) and a setter that keeps other params. */
export function useRange(): [PerfRange, (r: PerfRange) => void] {
  const [params, setParams] = useSearchParams();
  const range = parseRange(params.get(RANGE_PARAM));
  const setRange = useCallback(
    (r: PerfRange) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (r === DEFAULT_PERF_RANGE) next.delete(RANGE_PARAM);
          else next.set(RANGE_PARAM, r);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  return [range, setRange];
}
