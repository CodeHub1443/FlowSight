import { useFrame, useThree } from '@react-three/fiber';
import { BriefcaseConveyorBelt, Crosshair, DoorOpen } from 'lucide-react';
import { memo, useMemo, useRef, type CSSProperties, type RefObject } from 'react';
import { Vector3 } from 'three';
import { hexAlpha, LIGHT_TOKENS, type ScenePalette, type SceneTheme } from '../materials';

// In-scene pill labels (docs/06 section 2, D8, section 8.4): 999 px radius, soft two-layer shadow, small icon; a filled
// dark-blue pill marks the selected object. They are plain
// DOM elements in one layer over the canvas (crisp text, Bangla shaping, CSS transitions), rendered once with stable
// keys; only their text and visibility change (docs/06 section 4: no remounts). One useFrame (<PillProjector/>)
// projects every anchor and writes `transform` through refs, so moving the camera never re-renders React.
// drei <Html> was not used: it creates a React root per label, and under StrictMode the first one lost its element.

/** Each pill's positioned wrapper; hidden until the projector has placed it. */
const WRAP: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  visibility: 'hidden',
  willChange: 'transform',
};

const FONT = "Inter, 'Noto Sans Bengali', sans-serif";

export type Anchors = ReadonlyMap<string, readonly [number, number, number]>;
export type PillElements = Map<string, HTMLElement>;

export const SELECTION_KEY = '__selection';
/** The pill that follows a selected truck, person or forklift (interaction/ActorInteraction.tsx positions and fills it). */
export const ACTOR_KEY = '__actor';

function styles(p: ScenePalette, dark: boolean) {
  const pill: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 10px 3px 3px',
    borderRadius: 999,
    background: p.pillBg,
    color: p.pillFg,
    border: `1px solid ${hexAlpha(p.pillBorder, dark ? 0.25 : 0.06)}`,
    boxShadow: `0 1px 2px ${hexAlpha(p.contactShade, 0.3)}, 0 8px 24px ${hexAlpha(p.contactShade, 0.3)}`,
    font: `500 12px/18px ${FONT}`,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  };
  const tile: CSSProperties = {
    display: 'grid',
    placeItems: 'center',
    width: 18,
    height: 18,
    borderRadius: 999,
    background: p.brandTint,
    color: p.brand,
  };
  const onFill = LIGHT_TOKENS.card;
  const filled: CSSProperties = {
    ...pill,
    background: p.selectionPill,
    color: onFill,
    border: `1px solid ${hexAlpha(onFill, 0.16)}`,
  };
  const filledTile: CSSProperties = { ...tile, background: hexAlpha(onFill, 0.18), color: onFill };
  return {
    pill,
    tile,
    filled,
    filledTile,
    filledSub: { color: hexAlpha(onFill, 0.82), fontWeight: 500 } satisfies CSSProperties,
  };
}

export interface BayPillData {
  id: string;
}

interface PillLayerProps {
  palette: ScenePalette;
  theme: SceneTheme;
  /** The bay whose number pill is filled (docs/06 section 8.4). */
  selectedBayId: string | null;
  bays: readonly BayPillData[];
  showBayPills: boolean;
  /** Text of the selected (or last selected, while it fades out) bay. */
  selection: { title: string; sub: string } | null;
  selectionVisible: boolean;
  elements: RefObject<PillElements>;
}

/** The DOM layer with every pill; positioned by <PillProjector/>. Never takes pointer events. */
export const PillLayer = memo(function PillLayer({
  palette,
  theme,
  selectedBayId,
  bays,
  showBayPills,
  selection,
  selectionVisible,
  elements,
}: PillLayerProps) {
  const s = useMemo(() => styles(palette, theme === 'dark'), [palette, theme]);
  const register = (key: string) => (el: HTMLElement | null) => {
    if (el) elements.current.set(key, el);
    else elements.current.delete(key);
  };
  return (
    <div
      aria-hidden
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
    >
      {bays.map((b) => (
        <div key={b.id} ref={register(b.id)} style={WRAP} data-testid="scene-bay-pill">
          <div
            style={{
              ...(selectedBayId === b.id ? s.filled : s.pill),
              fontWeight: 600,
              opacity: showBayPills ? 1 : 0,
              transition: 'opacity 200ms ease-out, background-color 200ms ease-out',
            }}
          >
            <span style={selectedBayId === b.id ? s.filledTile : s.tile}>
              <DoorOpen size={12} strokeWidth={1.75} aria-hidden />
            </span>
            {b.id}
          </div>
        </div>
      ))}
      <div ref={register(SELECTION_KEY)} style={WRAP} data-testid="scene-selection-pill">
        <div
          style={{
            ...s.filled,
            opacity: selectionVisible ? 1 : 0,
            transform: selectionVisible ? 'translateY(0) scale(1)' : 'translateY(4px) scale(0.96)',
            transition: 'opacity 200ms ease-out, transform 200ms ease-out',
          }}
        >
          <span style={s.filledTile}>
            <BriefcaseConveyorBelt size={12} strokeWidth={1.75} aria-hidden />
          </span>
          <span style={{ fontWeight: 600 }}>{selection?.title ?? ''}</span>
          <span style={s.filledSub}>{selection?.sub ?? ''}</span>
        </div>
      </div>
      {/* text and position are written by ActorInteraction every frame, through the ref: React never owns them */}
      <div ref={register(ACTOR_KEY)} style={WRAP} data-testid="scene-actor-pill">
        <div style={s.filled}>
          <span style={s.filledTile}>
            <Crosshair size={12} strokeWidth={1.75} aria-hidden />
          </span>
          <span data-actor-pill-text="" style={{ fontWeight: 600 }} />
        </div>
      </div>
    </div>
  );
});

/** Inside the Canvas: projects each anchor (three.js world position) to its pill element every frame, via refs. */
export function PillProjector({
  anchors,
  elements,
}: {
  anchors: Anchors;
  elements: RefObject<PillElements>;
}) {
  const camera = useThree((st) => st.camera);
  const size = useThree((st) => st.size);
  const v = useRef(new Vector3());
  useFrame(() => {
    for (const [key, at] of anchors) {
      const el = elements.current.get(key);
      if (!el) continue;
      const p = v.current.set(at[0], at[1], at[2]).project(camera);
      const onScreen = p.z > -1 && p.z < 1;
      const x = ((p.x + 1) / 2) * size.width;
      const y = ((1 - p.y) / 2) * size.height;
      const t = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      if (el.dataset.t !== t) {
        el.style.transform = t;
        el.dataset.t = t;
      }
      const vis = onScreen ? 'visible' : 'hidden';
      if (el.style.visibility !== vis) el.style.visibility = vis;
    }
  });
  return null;
}
