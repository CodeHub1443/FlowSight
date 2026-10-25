import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

// Canvas textures are used only for labels, plates and the facade stripe band (docs/04 section 1).
// Bangla text is never drawn here (docs/04 section 4): these carry IDs and English equipment names only.

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
  bg: string;
  fg: string;
  border?: string;
}

/** A plate with centred text; cached per (text, style, size). */
export function plateTexture(text: string, style: PlateStyle, w = 256, h = 96): CanvasTexture {
  const key = `plate|${text}|${style.bg}|${style.fg}|${style.border ?? ''}|${w}x${h}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, g } = canvas(w, h);
  if (g) {
    g.fillStyle = style.bg;
    g.fillRect(0, 0, w, h);
    if (style.border) {
      g.strokeStyle = style.border;
      g.lineWidth = Math.max(4, h * 0.06);
      g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth);
    }
    g.fillStyle = style.fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = h * 0.62;
    g.font = `700 ${size}px Inter, Arial, sans-serif`;
    while (g.measureText(text).width > w * 0.9 && size > 8) {
      size -= 2;
      g.font = `700 ${size}px Inter, Arial, sans-serif`;
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
