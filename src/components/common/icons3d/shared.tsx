import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { Tone } from '../tone';
import { IdContext, useFill, type FillName, type iso, type Pt } from './kit';

// Drawing kit of the 3D icon set (docs/06 section 7.4): inline SVG on a 40 x 40 grid, isometric, one light from the
// upper left (top face lightest, left face mid, right face darkest). Colours are only the `--i3-*` tokens of
// src/index.css, set per tone by the `.i3` rules there, so a tinted icon is the same drawing with another ramp.

/** The tones with their own colour ramp; other status tones draw in neutral. */
const RAMP: Partial<Record<Tone, string>> = {
  info: 'info',
  warn: 'warn',
  critical: 'critical',
};

const LINEAR: Record<FillName, readonly (readonly [number, string])[]> = {
  top: [
    [0, '--i3-100'],
    [1, '--i3-300'],
  ],
  left: [
    [0, '--i3-300'],
    [0.55, '--i3-500'],
    [1, '--i3-500'],
  ],
  right: [
    [0, '--i3-700'],
    [1, '--i3-900'],
  ],
  body: [
    [0, '--i3-300'],
    [0.42, '--i3-500'],
    [1, '--i3-700'],
  ],
  white: [
    [0, '--i3-white'],
    [1, '--i3-white-shade'],
  ],
  whiteSide: [
    [0, '--i3-white'],
    [1, '--i3-white-deep'],
  ],
  whiteDeep: [
    [0, '--i3-white-shade'],
    [1, '--i3-white-deep'],
  ],
  dark: [
    [0, '--i3-700'],
    [1, '--i3-900'],
  ],
};

const pts = (p: readonly Pt[]) => p.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

/** A face with slightly rounded corners: the same paint as a round-joined stroke. */
export function Face({
  p,
  fill,
  round = 1,
  opacity,
}: {
  p: readonly Pt[];
  fill: FillName;
  round?: number;
  opacity?: number;
}) {
  const f = useFill();
  return (
    <polygon
      points={pts(p)}
      fill={f(fill)}
      stroke={round > 0 ? f(fill) : undefined}
      strokeWidth={round}
      strokeLinejoin="round"
      opacity={opacity}
    />
  );
}

type Project = ReturnType<typeof iso>;

/** A box between the given u, v, w ranges: its three visible faces. */
export function IsoBox({
  at,
  u: [u0, u1],
  v: [v0, v1],
  w: [w0, w1],
  top = 'top',
  left = 'left',
  right = 'right',
  round,
}: {
  at: Project;
  u: Pt;
  v: Pt;
  w: Pt;
  top?: FillName;
  left?: FillName;
  right?: FillName;
  round?: number;
}) {
  return (
    <>
      <Face
        p={[at(u0, v1, w1), at(u1, v1, w1), at(u1, v1, w0), at(u0, v1, w0)]}
        fill={left}
        round={round}
      />
      <Face
        p={[at(u1, v1, w1), at(u1, v0, w1), at(u1, v0, w0), at(u1, v1, w0)]}
        fill={right}
        round={round}
      />
      <Face
        p={[at(u0, v0, w1), at(u1, v0, w1), at(u1, v1, w1), at(u0, v1, w1)]}
        fill={top}
        round={round}
      />
    </>
  );
}

/** The bright edge where lit faces meet: what makes a flat polygon read as a bevelled solid. */
export function Edge({
  p,
  width = 0.8,
  opacity = 0.7,
}: {
  p: readonly Pt[];
  width?: number;
  opacity?: number;
}) {
  return (
    <polyline
      points={pts(p)}
      fill="none"
      style={{ stroke: 'var(--i3-white)' }}
      strokeWidth={width}
      strokeOpacity={opacity}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/** The soft contact shadow every object stands on. */
export function GroundShadow({
  cx,
  cy,
  rx,
  ry,
}: {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}) {
  const f = useFill();
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={f('shadow')} />;
}

/** The svg element and its gradients; ids are per instance, so hiding one icon never breaks another. */
export function IconFrame({
  tone = 'info',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  const id = `i3${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg
      viewBox="0 0 40 40"
      aria-hidden
      focusable="false"
      data-tone={RAMP[tone] ?? 'neutral'}
      className={cn('i3 block', className)}
    >
      <defs>
        {(Object.keys(LINEAR) as FillName[]).map((name) => (
          <linearGradient
            key={name}
            id={`${id}-${name}`}
            x1="0"
            y1="0"
            x2={name === 'body' ? '1' : '0.6'}
            y2={name === 'body' ? '0.15' : '1'}
          >
            {LINEAR[name].map(([offset, token]) => (
              <stop key={offset} offset={offset} style={{ stopColor: `var(${token})` }} />
            ))}
          </linearGradient>
        ))}
        <radialGradient id={`${id}-shadow`}>
          <stop offset="0" style={{ stopColor: 'var(--i3-900)', stopOpacity: 0.42 }} />
          <stop offset="0.6" style={{ stopColor: 'var(--i3-900)', stopOpacity: 0.16 }} />
          <stop offset="1" style={{ stopColor: 'var(--i3-900)', stopOpacity: 0 }} />
        </radialGradient>
      </defs>
      <IdContext.Provider value={id}>{children}</IdContext.Provider>
    </svg>
  );
}
