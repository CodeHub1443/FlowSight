import { act, renderHook } from '@testing-library/react';
import { afterAll, describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { useFmt } from './useFmt';

afterAll(async () => {
  await i18n.changeLanguage('en');
});

describe('useFmt.durHM', () => {
  it('formats minutes in the UI language (Bangla digits in bn) and dashes unknown values', async () => {
    await act(() => i18n.changeLanguage('en'));
    const { result, rerender } = renderHook(() => useFmt());
    expect(result.current.durHM(65)).toBe('1h 05m');
    expect(result.current.durHM(44.6)).toBe('45m');
    expect(result.current.durHM(null)).toBe('—');

    await act(() => i18n.changeLanguage('bn'));
    rerender();
    expect(result.current.durHM(65)).toBe('১ ঘ ০৫ মি');
    expect(result.current.durHM(130)).toBe('২ ঘ ১০ মি');
    expect(result.current.durHM(undefined)).toBe('—');
  });
});
