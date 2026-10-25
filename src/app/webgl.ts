let cached: boolean | null = null;

/**
 * Whether this browser can create a WebGL context. Checked once. Environments without the WebGL constructors
 * (jsdom in unit tests) return false without touching canvas.getContext.
 */
export function hasWebGL(): boolean {
  if (cached !== null) return cached;
  if (
    typeof window === 'undefined' ||
    (!('WebGL2RenderingContext' in window) && !('WebGLRenderingContext' in window))
  ) {
    cached = false;
    return cached;
  }
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    cached = gl !== null;
  } catch {
    cached = false;
  }
  return cached;
}
