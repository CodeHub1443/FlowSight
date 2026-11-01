import { memo, type CSSProperties, type RefObject } from 'react';
import type { ScenePalette } from '../materials';

// Rear plates of the trucks (docs/04 section 4): DOM over the canvas, because Bengali needs the browser's text shaping
// and troika cannot do it. A fixed set of elements, as with the pills (labels/Pills.tsx): rendered once with stable keys,
// their text and transform written through refs from ActorsLayer's useFrame, so a truck never causes a React render.
// Bangla first, English second (CLAUDE.md). No names, no other PII.

/** Plate elements by plate slot. */
export type PlateElements = Map<number, HTMLElement>;

/** Size of a plate element before its transform, CSS pixels: the plate's 0.92 x 0.44 m. */
export const PLATE_BASE_PX = 92;
export const PLATE_BASE_H_PX = 44;

const WRAP: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  visibility: 'hidden',
  willChange: 'transform',
  transformOrigin: '0 0',
};

export const TruckPlates = memo(function TruckPlates({
  count,
  palette,
  elements,
}: {
  count: number;
  palette: ScenePalette;
  elements: RefObject<PlateElements>;
}) {
  const plate: CSSProperties = {
    width: PLATE_BASE_PX,
    height: PLATE_BASE_H_PX,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    boxSizing: 'border-box',
    padding: '1px 2px',
    borderRadius: 4,
    background: palette.plateGreen,
    color: palette.plateFg,
    textAlign: 'center',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    userSelect: 'none',
    font: "600 12px/15px Inter, 'Noto Sans Bengali', sans-serif",
    fontVariantNumeric: 'tabular-nums',
  };
  return (
    <div
      aria-hidden
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            if (el) elements.current.set(i, el);
            else elements.current.delete(i);
          }}
          style={WRAP}
          data-testid="truck-plate"
        >
          <div style={plate}>
            <div />
            <div />
            <div style={{ fontSize: 6, lineHeight: '8px', fontWeight: 500 }} />
          </div>
        </div>
      ))}
    </div>
  );
});
