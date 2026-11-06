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

  // Every useFrame user, each justified (Task 07A):
  //  - CameraRig.tsx: eased fly-to and pan bounds (refs only).
  //  - Appear.tsx: 200 ms rise / fade-in of objects and the selection ring (docs/06 section 2 "no popping");
  //    ref-driven, a finished animation is one boolean check per frame.
  //  - ContactShadowLayer.tsx: on-demand contact-shadow render; compares a sequence number and returns unless
  //    something invalidated it (BACKLOG: no frames=1 once anything can move).
  //  - Pills.tsx (PillProjector): projects the pill anchors and writes CSS transforms through refs (docs/06
  //    section 4: labels move with the camera without any React render).
  //  - EventPin.tsx: the 1.2 s bob of an event pin (docs/06 D9), ref-driven.
  //  - AutoQuality.tsx: feeds the frame time to TierGovernor (a ref); reports to React only on a tier step.
  //  - ActorsLayer.tsx: interpolates people, forklifts, trucks and belt items into instance buffers (docs/02 section 6
  //    rule 2) and places the truck plates; all refs and buffers, no React state. It also steps the boom, belt surface and
  //    shutter state of each bay (bay/bayAnim.ts) and the crew separation (Task 22B).
  //  - DynamicBoxes.tsx: rewrites the matrices of a few instanced boxes (boom, belt ticks, shutter) when a stamp has
  //    changed; one number comparison per frame at rest (Task 22B).
  //  - Bay.tsx: moves the boom-tip roller group when the boom stamp has changed (Task 22B).
  //  - CameraGlyphs.tsx: repaints the glyphs when the board changes and pulses the offline ones, off under
  //    prefers-reduced-motion (Task 22B).
  //  - ActorInteraction.tsx: follows the hovered and selected actor with a ring and a pill through refs (Task 22B).
  it('limits useFrame to the camera rig, motion, on-demand contact shadows, pills, event pins, auto quality, actors and bay animation', () => {
    expect(withFrame.map(([p]) => base(p)).sort()).toEqual(
      [
        'ActorInteraction.tsx',
        'ActorsLayer.tsx',
        'Appear.tsx',
        'AutoQuality.tsx',
        'Bay.tsx',
        'CameraGlyphs.tsx',
        'CameraRig.tsx',
        'ContactShadowLayer.tsx',
        'DynamicBoxes.tsx',
        'EventPin.tsx',
        'Pills.tsx',
      ].sort(),
    );
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

  it('limits React state to quality tier, tab visibility, the shown selection pill and the dev preview', () => {
    const stateFiles = entries.filter(([, src]) => /useState[<(]/.test(src)).map(([p]) => base(p));
    expect(stateFiles.sort()).toEqual(['SceneRoot.tsx', 'ScenePreview.tsx'].sort());
  });
});
