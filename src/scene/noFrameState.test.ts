// @vitest-environment node
import { describe, expect, it } from 'vitest';

// docs/02 section 6, rule 1 and the 3D performance rules: no React state updates per frame. Every useFrame
// callback under src/scene must be free of state setters, store writes and invalidating hooks.

const sources: Record<string, string> = import.meta.glob(
  ['./**/*.ts', './**/*.tsx', '!./**/*.test.ts'],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
);
const entries = Object.entries(sources);
const base = (path: string) => path.split('/').pop() ?? path;

/** Body of every `useFrame(...)` call in `src`, found by matching parentheses. */
function frameCallbackBodies(src: string): string[] {
  const bodies: string[] = [];
  let from = 0;
  for (;;) {
    const at = src.indexOf('useFrame(', from);
    if (at < 0) return bodies;
    let depth = 0;
    let i = at + 'useFrame'.length;
    for (; i < src.length; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')' && --depth === 0) break;
    }
    bodies.push(src.slice(at, i + 1));
    from = i;
  }
}

describe('no React state per frame', () => {
  const withFrame = entries.filter(([, src]) => src.includes('useFrame('));

  it('scans the scene sources', () => {
    expect(entries.length).toBeGreaterThan(20);
  });

  it('finds the camera rig as the only useFrame consumer', () => {
    expect(withFrame.map(([p]) => base(p))).toEqual(['CameraRig.tsx']);
  });

  it('keeps setters and store writes out of useFrame callbacks', () => {
    for (const [path, src] of withFrame) {
      const setters = [...src.matchAll(/const \[\w+, (set\w+)\] = useState/g)].map(
        (m) => m[1] ?? '',
      );
      for (const body of frameCallbackBodies(src)) {
        for (const s of setters) expect(body, `${path}: ${s}`).not.toContain(`${s}(`);
        expect(body).not.toMatch(/\bset\w*State\b|useState|useStore|\.setState\(|dispatch\(/);
      }
    }
  });

  it('limits React state to quality tier, tab visibility and the dev preview controls', () => {
    const stateFiles = entries.filter(([, src]) => /useState[<(]/.test(src)).map(([p]) => base(p));
    expect(stateFiles.sort()).toEqual(['SceneRoot.tsx', 'ScenePreview.tsx'].sort());
  });
});
