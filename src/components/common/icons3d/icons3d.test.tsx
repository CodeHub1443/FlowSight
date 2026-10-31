import { render } from '@testing-library/react';
import { Package } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { IconTile } from '../IconTile';
import drawingsSource from './drawings.tsx?raw';
import { ICONS_3D } from './index';
import sharedSource from './shared.tsx?raw';

const ENTRIES = Object.entries(ICONS_3D);

describe('3D icon set (docs/06 section 7.4)', () => {
  it.each(ENTRIES)('%s is a self-contained vector drawing', (_name, Icon) => {
    const { container } = render(<Icon />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('viewBox', '0 0 40 40');
    expect(svg).toHaveAttribute('aria-hidden');
    expect(container.querySelectorAll('image, text, foreignObject')).toHaveLength(0);
  });

  it.each(ENTRIES)('%s references only gradients defined in its own svg', (_name, Icon) => {
    const { container } = render(<Icon />);
    const ids = new Set([...container.querySelectorAll('[id]')].map((e) => e.id));
    const refs = container.innerHTML.match(/url\(#[^)]+\)/g) ?? [];
    expect(refs.length).toBeGreaterThan(0);
    for (const r of refs) expect(ids.has(r.slice(5, -1)), r).toBe(true);
  });

  it('two instances never share a gradient id', () => {
    const { container } = render(
      <>
        <ICONS_3D.Box3d />
        <ICONS_3D.Box3d />
      </>,
    );
    const ids = [...container.querySelectorAll('[id]')].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('a status tone selects the tinted ramp and keeps the same drawing', () => {
    const shapes = (tone: 'info' | 'critical' | 'warn') => {
      const { container } = render(<ICONS_3D.Bell3d tone={tone} />);
      const svg = container.querySelector('svg');
      return { ramp: svg?.getAttribute('data-tone'), count: svg?.querySelectorAll('path').length };
    };
    expect(shapes('critical').ramp).toBe('critical');
    expect(shapes('warn').ramp).toBe('warn');
    expect(shapes('critical').count).toBe(shapes('info').count);
  });

  it('contains no colour literals: every colour is a token', () => {
    // `url(#...)` references are not colours: a literal is a # after anything else
    for (const src of [drawingsSource, sharedSource]) {
      expect(src).not.toMatch(/(?<!url\()#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    }
  });
});

describe('IconTile', () => {
  it('draws a 3D icon on the pale tile, the same size as any other tile', () => {
    const { container } = render(<IconTile icon={ICONS_3D.Truck3d} />);
    const tile = container.firstElementChild;
    expect(tile).toHaveClass('tile-pale', 'size-[48px]', 'rounded-tile');
    expect(tile?.querySelector('svg')).toHaveClass('i3');
  });

  it('passes the status tone to the 3D icon and tints the tile', () => {
    const { container } = render(<IconTile icon={ICONS_3D.Bell3d} tone="critical" />);
    expect(container.firstElementChild).toHaveClass('bg-critical-bg');
    expect(container.querySelector('svg')).toHaveAttribute('data-tone', 'critical');
  });

  it('still draws lucide glyphs for concepts without a 3D icon', () => {
    const { container } = render(<IconTile icon={Package} />);
    expect(container.firstElementChild).toHaveClass('tile-pale');
    expect(container.querySelector('svg.lucide')).not.toBeNull();
  });
});
