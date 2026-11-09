import { describe, expect, it } from 'vitest';
import { computeToastOffsetTop, TOAST_OFFSET_TOP_FALLBACK } from './toastOffset';

describe('computeToastOffsetTop', () => {
  it('falls back to the safe-area offset when the KPI row is not mounted', () => {
    expect(computeToastOffsetTop(null)).toBe(TOAST_OFFSET_TOP_FALLBACK);
  });

  it('sits 12px below the measured KPI row bottom at 1920x1080', () => {
    expect(computeToastOffsetTop(157)).toBe(169);
  });

  it('sits 12px below the measured KPI row bottom at 1366x768', () => {
    expect(computeToastOffsetTop(162)).toBe(174);
  });
});
