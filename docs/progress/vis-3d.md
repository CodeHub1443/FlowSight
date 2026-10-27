# Task 07A: 3D visual quality pass (parallel worktree `vis3d`, branch `vis-3d`)

Baseline `815921f` (verified, clean tree at start). Nothing committed. Only owned paths were edited:
`src/scene/**`, `src/app/LiveScene.tsx` (+ new `LiveScene.test.tsx`), `scripts/scene-shot.mjs`, `docs/progress/vis-3d.md`,
`docs/screens/vis-3d-*.png`. `scene-preview.html`, `sceneTarget.ts` and `scene.json` needed no change.

## Log
1. **Before** shots with the unchanged scene: `docs/screens/vis-3d-before-{floor-overview,bay-4,dock-wall}.png`
   (`node scripts/scene-shot.mjs --prefix=vis-3d-before --perf`).
2. **Palette** (`materials.ts`) rebuilt on the docs/06 section 1 tokens (light) and the docs/06 dark values; every other scene
   colour is a mix of tokens (`derive`). Hard-coded colours removed from label plates, door plates, FG/DC marks and the
   contact-shadow tint (BACKLOG). CSS tokens are read only once the stylesheet carries the docs/06 set (marker
   `--scene-floor-line`), so the stale step-06 `--scene-floor` etc. in today's `src/index.css` cannot leak in.
3. **Geometry**: one shared rounded-box geometry per smoothness; the vertex shader rebuilds each vertex from its corner sign
   so radii stay true metres under non-uniform instance scaling (no stretched corners on a 9 m beam). Roughness, metalness
   and rounding are per instance (`instanceFinish`), so instancing is unchanged (one draw call per detail level).
   Rebuilt: EZ-style telescopic conveyor, door frames and shutter hood, walls with rounded accent cap, columns, pallets
   with deck slots, feet and runners, taped cartons, open crates, pillow sacks, cabinets with hood, seam, handle, buttons.
4. **Lighting/rendering**: Lightformer-only `Environment`, hemisphere fill, low shadowless fill, key light with PCF shadow
   (radius 6, 16 taps instead of three's 5, 4096 map on High), N8AO + SMAA on High/Med, nothing on Low, on-demand
   contact shadows (all tiers). Tone mapping: **Khronos PBR Neutral** (user decision, see Deviations 1).
5. **Quality**: `/live` is automatic by default (starts Med, PerformanceMonitor steps); `uiStore.setQuality` or
   `?quality=high|med|low` pins a tier.
6. **Camera**: `SCENE_SAFE_AREA = { top: 112, right: 384, bottom: 24, left: 24 }` (`camera/view.ts`) applied with an
   aspect-preserving `camera.setViewOffset`; the canvas still shows FOV 28 deg; presets fit their region into the safe
   rectangle by bisection. Fly-to 800 ms easeInOutCubic.
7. **Labels**: bay number pills on the dock-wall accent band and one selection pill, as one DOM layer positioned by a
   single `useFrame` through refs (no per-label React roots, no remounts). Objects rise in over 200 ms; selection ring and
   pill fade/scale in over 200 ms.
8. Stale E/W yaw comment in `site/transforms.ts` fixed (BACKLOG).
9. **After** shots, perf and composite: `node scripts/scene-shot.mjs --prefix=vis-3d-after --all`.

## docs/06 section 2 evidence
| Rule | Where |
|---|---|
| Rounded geometry, radius 3-8 % of the smallest side, smoothness 4 | `geometry.ts:29` (`ROUND = 0.08`), shader rebuild `geometry.ts:115`; smoothness per tier `quality.ts` (High `hi` 4) |
| Cartons with tape strip | `bay/stagingLayout.ts:88` (`carton()`), storage top tape `bay/storageLayout.ts` |
| Pallets with slots | `bay/stagingLayout.ts:37` (`pallet()`: deck, 9 feet, 3 runners, 6 slots) |
| Conveyor rollers, side guides, rounded ends | `bay/bayItems.ts:43` (body, sections, flared guides `roll`), `:125` rollers, `:141` chassis/motor |
| N8AO + SMAA on High/Med, none on Low | `ScenePost.tsx:22-35`; `quality.ts` (`post: null` on Low); test `ScenePost.test.tsx` |
| Environment from local Lightformers only | `SceneLights.tsx:40-75` (no `preset`/`files`; 0 non-localhost requests in scene-shot) |
| Key light `shadow.radius` >= 6, tuned bias | `SceneLights.tsx:22-26`, `:92`; 16-tap PCF `softShadows.ts` (+ test) |
| Hemisphere fill | `SceneLights.tsx:76` |
| Tone mapping, exposure 1, sRGB | `SceneRoot.tsx:142-144`, `ScenePost.tsx:35`, `toneMapping.ts:14` (Neutral, see Deviations 1) |
| MeshStandard, roughness 0.55-0.75, metalness 0 except steel 0.4 | `materials.ts:277-297`; test `materials.test.ts` |
| No pure black; belt `#2E3445` darkest | `materials.ts` LIGHT_TOKENS; test `materials.test.ts` |
| FOV 26-30, safe area via setViewOffset | `camera/view.ts:8` (28), `:22`, `:118`; `CameraRig.tsx:60`; test `camera/view.test.ts` |
| Pill labels, bay numbers on the dock-wall band | `labels/Pills.tsx:35-50` (999 px radius, two-layer shadow, icon), anchors `labels/anchors.ts` |
| Fly-to easeInOutCubic 700-900 ms | `camera/view.ts:126-128`; test `view.test.ts` |
| Objects fade/scale in over 200 ms | `Appear.tsx:9-51` (`Appear`, `FadeIn`) |
| Contact shadows not frames=1 | `ContactShadowLayer.tsx` + `contactShadowController.ts` (on demand, `maxHz` per tier) |

## Decisions and deviations
1. **Tone mapping: Khronos PBR Neutral instead of ACES/AgX (user decision in this session).** Measured on our render, ACES
   and AgX turn the docs/06 pale tints grey (floor `#EEF2FC` -> ~`#DDDEE1` ACES / `#C4C6C9` AgX; void `#E6ECFA` -> `#DBDCE1` /
   `#C1C4C8`) and dull the brand blue; no exposure fixes it (ACES would need inputs like (1.3, 2.0, 5.9)). Neutral keeps them
   within a few RGB units. One constant (`toneMapping.ts`); the preview takes `?tm=aces|agx|neutral` for A/B.
   **docs/06 section 2 and ADR-11 still say ACES/AgX: please update them.**
2. `postprocessing` 6.39.5 `ToneMappingEffect`: runtime default is **AgX** (its typings claim ACES) and the typings number
   `ToneMappingMode` differently from the runtime. The mode is passed explicitly with runtime values; `toneMapping.test.ts`
   reads the installed build to keep them in sync.
3. Unlit colours: the clear colour is tone-mapped only by the post chain, fog on every tier; both are pre-scaled
   (`UNLIT_GAIN` 1.5) where tone mapping applies so the void renders `#E4EAF7` (token `#E6ECFA`).
4. Light balance: a hot exposure pushed the floor into the tone curve's shoulder where shadows and AO vanish. The key light
   now carries most of the light (3.4) with low fill (env 0.24, hemisphere 0.32, shadowless side fill 0.9). Light colours
   are theme-independent (`keyLight`, `skyFill` from the light tokens): the dark theme darkens surfaces, not lights.
5. **Shadows**: three r186 PCF uses 5 noise-rotated taps, which shows as grain at radius 6; `softShadows.ts` raises it to 16
   (patch of `ShaderChunk.shadowmap_pars_fragment`, guarded by a test). At 2048 px a radius-6 penumbra (~0.3 m) erased the
   shadows of 0.5 m crates, so High uses a 4096 map. VSM was tried and gave too-weak object shadows.
6. **Contact shadows** are a small own renderer (drei's technique) instead of drei `<ContactShadows frames=1>`: it re-renders
   only on `contactShadows.invalidate()` (objects finished appearing, theme/tier change; actors in step 7) at most 8/4/2 Hz
   (High/Med/Low). Two bugs found and fixed on the way: a parentless shadow camera had its matrix recomputed by the
   renderer, and the blur quad was outside the shadow camera.
7. **Pills are not drei `<Html>`**: drei creates a React root per label and under StrictMode (dev and app) the first one
   lost its element (B01's pill was missing). One DOM layer + one projector `useFrame` fixes it and avoids remounts.
8. **Dock wall band**: the shed side carries the `--scene-wall-accent` stripe with the bay pills (docs/06); the yard side keeps
   the config facade stripes (physical paint, CLAUDE.md exception). No conflict: the facade is the outside.
9. Sacks use rounding 0.42/0.35 (pillows, not boxes); docs/06's 3-8 % applies to box-like objects.
10. Pallet feet and paint strips are plain boxes (`detail: 'flat'`): rounding is invisible at that size and saves ~2.6 k
    triangles per pallet.
11. Quality "auto" on /live: uiStore has no `auto` value (read-only), so LiveScene treats the store tier as an override only
    once it changes. Edge case: choosing `med` while the store already holds `med` does not pin. Request below.
13. Automatic quality starts at Low on software rasterisers (no GPU for AO, shadows or post); GPUs start at Med.
12. The 1 m floor grid and worn floor patches were removed (they produced the grey-green mottled look); zone outlines use
    `--scene-floor-line`.

## Commands and results
| Command | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm lint` | pass |
| `pnpm format:check` | pass |
| `pnpm test` | 45 files / 808 tests. Plain runs on the loaded machine: 2 to 4 failures, all simulator tests in `App.test.tsx` (once `MockControls.test.tsx`) hitting the 5 s default timeout; `App.test.tsx` alone passes 3/3 and `vitest run --testTimeout=20000` passes 808/808. New tests: `materials`, `quality`, `ScenePost`, `toneMapping`, `softShadows`, `camera/view`, `labels/anchors`, `app/LiveScene`; updated `presets`, `noFrameState` |
| `pnpm i18n:check` | ok |
| `pnpm contract:check` | ok (7 json blocks, 0 unmapped) |
| `pnpm build` | pass; entry chunk has no three.js; scene chunk 1.37 MB raw / 450 kB gzip (now includes postprocessing + N8AO) |
| `node scripts/scene-shot.mjs --prefix=vis-3d-after --all` | see "After set" below; click at the safe-area centre selects B04; 0 non-localhost requests |
| `E2E_PORT=4174 pnpm e2e` | 14 passed, 7 failed; see "E2E" below |

## Performance
Real GPU (this dev machine, Chrome, **Intel UHD Graphics** via ANGLE/D3D11, canvas 1536 x 673, Floor overview, light):
| Tier | draw calls / frame | triangles / frame | avg frame | p95 | fps |
|---|---|---|---|---|---|
| High | 250 | 1.42 M | 38.4 ms | 42.8 ms | 26 |
| Med | 188 | 274 k | 14.5 ms | 18.6 ms | 69 |
| Low | 142 | 246 k | 6.1 ms | 6.7 ms | 165 |

Counts are per frame including the shadow pass and post passes (`gl.info.autoReset` off). High is not meant for Intel UHD;
automatic mode starts at Med. Headless SwiftShader numbers (CPU raster, not representative) are in "After set".
Before (step-06, SwiftShader): High 171 calls / 58 k triangles, Med/Low 115 / 30 k.
Instancing is preserved: every repeated box/cylinder goes through `BoxInstances`/`CylInstances` (<= 3 InstancedMeshes per list).
No React state per frame: `noFrameState.test.ts` allow-list = CameraRig (fly/pan), Appear (200 ms motion), ContactShadowLayer
(on-demand render), Pills (projector writes transforms via refs); React state only in SceneRoot (tier, visibility, shown
selection pill) and the dev preview.

## After set
Files (all 1920x1080 unless named): `vis-3d-after-{floor-overview,bay-4,dock-wall,selected-bay,dark,bn}.png` (preview, High,
`/live` safe area), `vis-3d-after-live-1920x1080-{en,bn,dark}.png`, `vis-3d-after-live-1366x768-en.png`, `vis-3d-compare.png`
(our `/live` next to `ui-ref-t09.jpg`). Click at the safe-area centre (780, 584) selects B04. 0 non-localhost requests; the only
console message is the `THREE.Clock` deprecation from a dependency.

Headless SwiftShader (CPU raster, not representative; first full run, before pallet feet became plain boxes):
| Tier | draw calls / frame | triangles / frame | avg frame |
|---|---|---|---|
| High | 252 | 1.93 M | 990 ms |
| Med | 190 | 358 k | 1244 ms |
| Low | 143 | 330 k | 2211 ms (3 frames, noise) |

Later SwiftShader perf re-runs were aborted twice by a page reload under heavy machine load (Vite cold-start re-optimisation,
then a reload during sampling); the real-GPU table above is the one to use.

Looked at by eye:
- **Floor overview / `/live`**: pale periwinkle void and floor, saturated blue frames and cap rails, white walls, warm cartons,
  slotted blue/yellow/orange pallets, pillow sacks, soft key shadows plus AO and contact shadows. All 7 bays sit between the
  KPI chips and the right column at both sizes; B01 is clear of the tray/inspector.
- **Bay 4**: chunky EZ-style conveyor (blue housing, stepped boom sections, steel flared guides, rounded belt ends), grey
  cabinets with hood, seam, handle and red/green/yellow buttons, yellow motor housing with grilles, rounded blue door frames
  and shutter hoods, bay pills on the accent band.
- **Dark**: navy floor and walls, same saturated blues, dark pills; objects stay readable (light colours do not follow the theme).
- **Bangla**: UI strings switch; scene pills show IDs (`B01`...) and the selection pill shows `label.bn` (`বে ৪`) with clean glyphs.

## E2E
`E2E_PORT=4174 pnpm e2e` (clean run, nothing else running): **14 passed, 7 failed** (18.9 min, 1 worker, SwiftShader).
| Test | Result | Cause |
|---|---|---|
| live-scene:40 tray flies / click opens inspector | fail: got "Bay 3", expected "Bay 4" | **this change**: `clickSceneCentre` clicks the canvas centre; the camera target now projects to the safe-area centre (request 3) |
| live-scene:65 3D interior @1366 | fail: got "বে ২", expected "বে ৪" | **this change**, same click helper |
| live-scene:65 @1920, live-shell:56 @1920, smoke:18 @1920 | fail: `page.screenshot` 90 s timeout | CPU WebGL at 1920x1080; flaky between runs (smoke @1920 passed in the first run); the 1366 variants pass. Low tier is ~246 k triangles vs ~30 k before, so CPU raster is slower |
| live-shell:96, mock-live:73 | fail: simulated clock not at 19:2x within 60 s | simulator timing under load; no scene involvement (different tests hit it in the first run) |
| the other 14 | pass | includes `/live dark theme re-themes the scene` and the 1366 shell/smoke runs |

A first e2e run (9 failed) was not representative: a dev server, the GPU browser and a headless probe ran at the same time.
Automatic quality now starts at **Low on software rasterisers** (SwiftShader, llvmpipe, Basic Render Driver; `quality.ts`
`autoStartTier`), so e2e `/live` renders without N8AO/SMAA unless a spec pins a tier.
The e2e specs write into tracked `docs/screens/step-*.png`; I restored all 22 overwritten files byte-for-byte from HEAD
(`git show HEAD:<path> > <path>`, no git write).

## Remaining differences vs the reference (honest)
- The reference frames one building close up with large hero objects (trucks, forklifts, pins); our default frames all 7 bays,
  so every object is smaller and the image is busier. Actors (trucks, people, forklifts) arrive in step 7.
- Our floor is slightly greyer and less blue (`#E0E5F1`-`#E9ECF3`) than the reference ground (`#D6E1F7`-`#E6E9F8`); our shadows
  are crisper and more directional, the reference's are mostly soft ambient/contact shadows.
- The reference's warehouse is a tall exterior with roof; ours is a roofless interior cutaway by spec (docs/04 section 0).
- Storage blocks fill the bottom of the default view at 16:9 (width-bound framing leaves vertical slack); the visit tracker
  covers part of the B07/B06 staging at both sizes (it is not inside `SCENE_SAFE_AREA`).
- No pins, no truck rears at the doors yet (steps 7/8); conveyor boom does not extend yet (step 8).
- High tier on Intel UHD runs at ~26 fps (Med 69): auto mode handles it, but High needs a discrete GPU.

## Requests to main session
1. **CSS tokens** (src/index.css, owned by the UI session): add the docs/06 set with these names (materials.ts reads them):
   `--scene-void --scene-floor --scene-floor-line --scene-apron --scene-walkline --scene-wall --scene-wall-accent
   --brand-500 --brand-400 --brand-50 --carton --carton-tape --pallet-blue --pallet-yellow --pallet-orange --metal --belt
   --ok --ok-bg --warn --warn-bg --critical --critical-bg --ink-900 --ink-600 --ink-400`, values exactly docs/06 section 1
   (light). docs/06 gives no names for the carton tape and the pill backgrounds: I propose `--carton-tape`, `--ok-bg`,
   `--warn-bg`, `--critical-bg`. Dark: docs/06 fixes void `#0B1222`, floor `#141C2F`; the other dark scene values are in
   `DARK_TOKENS` (materials.ts) if the UI session wants to mirror them. Until `--scene-floor-line` exists the scene ignores
   CSS and uses its constants (which equal docs/06).
   Note: docs/06 `--ok/--warn/--critical` differ from CLAUDE.md `--status-ok/-warn/-critical`; the scene uses docs/06.
2. **docs/06 section 2 + ADR-11**: replace "ACES Filmic (or AgX)" with "Khronos PBR Neutral" (Deviations 1).
3. **e2e/live-scene.spec.ts** (`clickSceneCentre`): the camera target now projects to the centre of the safe area,
   not of the canvas. Click `x = 24 + (w - 408) / 2`, `y = 112 + (h - 136) / 2` (or import `viewFit(w, h, SCENE_SAFE_AREA).centre`).
4. **uiStore**: add `'auto'` to `QualityTier` and make it the default; LiveScene would then pass `undefined` for `auto`.
5. **Visit tracker**: it covers ~200 px at the bottom left, outside `SCENE_SAFE_AREA` (bottom 24). Either the UI keeps it
   collapsed by default on /live, or the safe area gets a bottom inset (I can change the constant in a follow-up).
6. `package.json` pins `@react-three/postprocessing` as `^3.2.2` (not exact, CLAUDE.md `save-exact`).
7. BACKLOG items done here (tick): palette, rounded geometry, AO/environment/soft shadows/tone mapping, B01 behind cards,
   hard-coded colours, auto quality on /live, conveyor/pallet proportions, transforms comment, contact shadows not frames=1.
