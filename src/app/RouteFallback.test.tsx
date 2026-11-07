import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RouteFallback } from './RouteFallback';

describe('RouteFallback', () => {
  it('renders text-free skeleton bars that pulse only without reduced motion', () => {
    render(<RouteFallback />);
    const root = screen.getByTestId('route-fallback');
    expect(root).toHaveTextContent('');
    const bars = root.querySelectorAll('[aria-hidden="true"]');
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) {
      expect(bar.className).toContain('bg-muted');
      expect(bar.className).toContain('motion-safe:animate-pulse');
    }
  });
});
