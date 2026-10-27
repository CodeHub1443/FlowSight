import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

// Canvas textures are used only for painted-on plates (cabinet names, FG/DC marks) and the facade stripe band.
// Bangla text is never drawn here (docs/04 section 4): these carry IDs and English equipment names only. Bay
// numbers and selection labels are DOM pills (labels/Pills.tsx).

const cache = new Map<string, CanvasTexture>();

function canvas(
  w: number,
  h: number,
): { c: HTMLCanvasElement; g: CanvasRenderingContext2D | null } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d') };
}

function finish(key: string, c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

export interface PlateStyle {
  /** Palette colours (materials.ts); never literals. */
  bg: string;
  fg: string;
  /** Corner radius as a fraction of the plate height (0.5 = pill). The corners outside are transparent. */
  radius?: number;
}

/** A plate with centred text; cached per (text, style, size). */
export function plateTexture(text: string, style: PlateStyle, w = 256, h = 96): CanvasTexture {
  const r = Math.min(0.5, style.radius ?? 0) * h;
  const key = `plate|${text}|${style.bg}|${style.fg}|${r}|${w}x${h}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, g } = canvas(w, h);
  if (g) {
    g.fillStyle = style.bg;
    g.beginPath();
    g.roundRect(0, 0, w, h, r);
    g.fill();
    g.fillStyle = style.fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = h * 0.56;
    g.font = `600 ${size}px Inter, Arial, sans-serif`;
    while (g.measureText(text).width > w - 2 * Math.max(r, h * 0.2) && size > 8) {
      size -= 2;
      g.font = `600 ${size}px Inter, Arial, sans-serif`;
    }
    g.fillText(text, w / 2, h / 2 + h * 0.03);
  }
  return finish(key, c);
}

/** Vertical stripes of `colors`, one stripe `stripeWidth` metres wide, repeated over `length` metres. */
export function stripeTexture(
  colors: readonly string[],
  stripeWidth: number,
  length: number,
): CanvasTexture {
  const key = `stripe|${colors.join(',')}|${stripeWidth}|${length}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const px = 32;
  const { c, g } = canvas(px * Math.max(1, colors.length), 8);
  if (g) {
    colors.forEach((col, i) => {
      g.fillStyle = col;
      g.fillRect(i * px, 0, px, 8);
    });
  }
  const t = finish(key, c);
  t.wrapS = RepeatWrapping;
  t.repeat.set(length / (stripeWidth * Math.max(1, colors.length)), 1);
  return t;
}
