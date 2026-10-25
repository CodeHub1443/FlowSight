// Generated placeholder evidence: a grey frame with the event's bounding box, label and timestamp.
// Uses OffscreenCanvas; where it is missing (Node tests) a 1x1 JPEG stands in so the contract still holds.

export interface PlaceholderInput {
  title: string;
  bay: string | null;
  ts: string;
  bbox: readonly [number, number, number, number];
  frameW: number;
  frameH: number;
}

const WIDTH = 640;

const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

function tinyJpeg(): Blob {
  const bin = atob(TINY_JPEG_BASE64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'image/jpeg' });
}

export async function renderPlaceholder(input: PlaceholderInput): Promise<Blob> {
  if (typeof OffscreenCanvas === 'undefined') return tinyJpeg();
  const height = Math.round((WIDTH * input.frameH) / input.frameW);
  const canvas = new OffscreenCanvas(WIDTH, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return tinyJpeg();
  const k = WIDTH / input.frameW;
  ctx.fillStyle = '#9aa0a6';
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  for (let x = 0; x < WIDTH; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }
  const [bx, by, bw, bh] = input.bbox;
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 3;
  ctx.strokeRect(bx * k, by * k, bw * k, bh * k);
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(bx * k, Math.max(0, by * k - 20), Math.min(WIDTH - bx * k, 230), 20);
  ctx.fillStyle = '#ffffff';
  ctx.font = '13px sans-serif';
  ctx.fillText(input.title, bx * k + 6, Math.max(14, by * k - 6));
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, height - 24, WIDTH, 24);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`${input.bay ?? 'SITE'}  ${input.ts}  (placeholder)`, 8, height - 8);
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
}
