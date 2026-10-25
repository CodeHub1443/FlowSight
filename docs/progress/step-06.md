# Step 6: static 3D shed interior (parallel worktree `scene`, branch `step-06-scene`)

Baseline `b274038`, clean tree at start. Nothing committed. Only owned paths were edited.

## What was built
`<SceneRoot siteConfig quality? theme? onSelect? selectedBayId? doorOpen? onReady? />` exported from `src/scene/index.ts`, together with
`useSceneCamera().flyTo(preset | bayId)`, `SCENE_PRESETS` and the types. It is not mounted in the app.

| Area | Files |
|---|---|
| Frames | `site/transforms.ts` (+test): bay-local <-> site for N/S/E/W, heading -> rotation.y, floorLevel and yard-grade rule |
| Builder | `site/layout.ts` (+test): pure SiteConfig -> `SiteLayout` (faces, doors, bays, conveyor site positions, apron slots, snapped column grid, bounds, context). No dhk numbers in components |
| Shed | `building/Shed.tsx` (slab, floor, 1 m grid, worn patches, instanced columns, cutaway walls with blue cap), `building/DockWall.tsx` (piers, stripe band from facade colours) |
| Face | `site/FaceContents.tsx` (apron strip, instanced guide dashes + holding slots, aisle lines, instanced storage), `site/ExteriorContext.tsx` (renders nothing unless `showExteriorContext`) |
| Bay | `bay/Bay.tsx` (selectable group, hit area, hover/selected ring, work-zone plate), `bay/bayItems.ts` (conveyor, legs, motor, cabinets, door boxes), `bay/DoorAssembly.tsx` (shutter barrel, number plates), `bay/stagingLayout.ts`, `bay/storageLayout.ts` |
| Look | `materials.ts` (light/dark palettes), `SceneLights.tsx`, `quality.ts`, `labels/textures.ts` (canvas plates and stripe only) |
| Camera | `camera/presets.ts` (+test), `camera/CameraRig.tsx` (OrbitControls, pan bounds, 800 ms eased fly), `camera/cameraController.ts` (`useSceneCamera`) |
| Dev | `scene-preview.html`, `src/scene/dev/{main.tsx,ScenePreview.tsx}`, `scripts/scene-shot.mjs`, `src/i18n/locales/{en,bn}/scene.json` |

Every requirement 1 to 10 of the brief is covered. Interaction evidence: the screenshot script clicks the B04 belt in the default view and asserts `onSelect` reported `B04`
(`step-06-selected-bay.png` shows the ring).

## Decisions and deviations
1. **docs/04 section 2.1 contradicts itself on E and W yaw.** The position formulas (E: `X = Xd - y, Z = Zd - x`; W: `X = Xd + y, Z = Zd + x`) require `faceYaw` E = +pi/2 and W = -pi/2 with three.js `rotation.y`; the doc lists the opposite signs. I derived the yaw from the position formulas and proved it in `transforms.test.ts` (heading 0 and +pi/2 point along bay +y and -x for every face). Dock face S is unaffected; the depot has no E/W dock. **Please correct the two signs in docs/04.**
2. **Orientation of the default view.** Looking south from the north half of the shed, east is on the left, so B01 (west) is on the right and B07 on the left. This is the physically correct view from inside; door plates are still numbered W to E. If the control room expects B01 on the left, the camera would have to sit outside the dock wall, which the spec rules out.
3. Dock wall piers are door height (3.8 m) and the stripe band adds 1.0 m, so the wall hides about 3.4 m of apron at 55 degrees. The Apron preset uses 56 degrees and aims at y = -6 to keep trucks visible.
4. Columns are snapped to bay boundaries along each dock face (never in a doorway or on a belt) and are only `cutawayWallHeight x 1.5` tall, since there is no roof.
5. Shadows: PCFSoftShadowMap was removed in three 0.186, so `shadows="percentage"` (PCF, softened by `shadow.radius`) is used on High. Med has baked contact shadows only, Low none.
6. Static geometry is instanced: each bay is about 15 draw calls (body, support/door/cabinet boxes, staging, marks, a few cylinders and plates). Box meshes are only used for the selection rings (hidden unless hovered or selected).
7. FG / DC pallet marks and the "Conveyor-0n" cabinet labels are painted-on scene art (equipment IDs), not UI strings, so they are not in i18n. Preset names and dev controls are in `scene.json` (en and bn).
8. Floor grid is a single `LineSegments` (not a canvas texture) to keep canvas textures to labels, plates and the stripe band.
9. Dev preview component is `src/scene/dev/ScenePreview.tsx` (docs/05 location). `?quality=`, `?theme=` and `?site=east3` query params drive the screenshots; `window.__sceneGl` exposes the renderer for stats.

## Commands and results
| Command | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm lint` | pass |
| `pnpm test` | pass, 633 tests (43 new, in 4 scene test files) |
| `pnpm i18n:check` | ok |
| `pnpm contract:check` | ok (7 json blocks, 0 unmapped) |
| `pnpm format:check` | pass |
| `pnpm build` | pass (scene is not imported by the app, bundle unchanged) |
| `node scripts/scene-shot.mjs --extras` | 5 required shots + selected-bay, dark, bn, east3 variant; click-select check passes; 0 non-localhost requests |

Tests added: transforms (4 faces, round trips, heading vs positions), layout (dhk: 7 doors at X = -19.5..19.5 on Z = 38, 7 conveyors from Z = 37.5 to 29, apron 12 m, 4 slots, no context, cutaway N/E/W; 3 bays on face E; 5 bays on N; context only when asked; columns off belts),
camera presets (orbit limits for 16:9 and 4:3, default looks south from the north half, bay centring), and `noFrameState.test.ts` (grep-style proof: only `CameraRig.tsx` calls `useFrame`, its callback has no setters or store writes, React state exists only in `SceneRoot.tsx` for quality tier and tab visibility and in the dev preview).
Grep evidence: `grep -rn useFrame src/scene` -> one callback (`camera/CameraRig.tsx`); `grep -rn useState src/scene` -> `SceneRoot.tsx` (tier, visibility), `dev/ScenePreview.tsx`.

## Performance (headless Chromium on SwiftShader, 1920x1080, not representative of a GPU)
| Tier | draw calls | triangles | avg frame | p95 | fps |
|---|---|---|---|---|---|
| High | 175 | 58.5 k | 261 ms | 567 ms | 3.8 |
| Low | 118 | 30.4 k | 302 ms | 383 ms | 3.3 |

Headless rasterises on the CPU, so these only show the geometry budget (about 120 to 175 draw calls, about 60 k triangles). Frame time must be re-measured on a GTX 1650 and on an Intel UHD 620 (targets in docs/02 section 6).
The only console message is `THREE.Clock deprecated` from a dependency.

## Visual comparison with the references
Compared `step-06-*.png` with `docs/reference/cam-crew-overhead-2.png`, `cam-belt.png` and `docs/reference/video/ui-ref-t13.jpg`.
- Matches: green-grey floor with wear patches, blue telescopic conveyors with stainless guides and nested boom sections, grey cabinets labelled `Conveyor-0n`, yellow motor housings, blue/yellow/orange pallets, blue crate stacks, kraft cartons and white sacks, yellow aisle lines, soft periwinkle void, light game-like palette, blue cap line on the cutaway walls.
- Remaining gaps:
  - Pallets are solid boxes (the real ones are perforated); no cables, hoses, fans or scattered litter.
  - Conveyors are slimmer and cleaner than the real machines and the belt is a flat dark strip.
  - The real floor is a stronger epoxy green with large worn patches; ours follows the spec hex and is paler.
  - Shading is flat (matte, no AO per ADR-10); north-facing wall faces read a little grey.
  - Storage blocks are generic and tall at the bottom of the default view.
  - No trucks, people, forklifts or pins yet (steps 7 and 8). Truck rears are therefore not visible through the doors; the apron strip is empty.

## Requests to main session
1. **CSS tokens** to add to `src/index.css` (light `:root`, dark `.dark`), values mirrored in `src/scene/materials.ts`:
   `--scene-void` `#e8ebf7` / `#0e1424`; `--scene-floor` `#dce7df` / `#1b2430`; `--scene-floor-grid` `#c3d2c8` / `#273341`; `--scene-walkline` `#f2c94c` / `#d9b23f`;
   `--scene-wall-cap` `#1f36c7` / `#4d63e8`; `--scene-apron` `#dde1f2` / `#151c30`; `--scene-conveyor` `#2f55b8` / `#3c64cc`; `--scene-belt` `#3a3f4a` / `#2a2e37`.
   `--scene-wall` already matches (`#f7f8fc` / `#1a2238`). Existing `--scene-ground` equals `--scene-void` and `--scene-yard` equals `--scene-apron`; the old exterior tokens (`road`, `grass`, `tree`, `roof`) are unused while `showExteriorContext` is false.
2. **Mount** in `<SceneSlot/>`: give it a sized parent (the canvas fills 100% x 100%), then
   `<SceneRoot siteConfig={config} theme={theme} onSelect={(s) => select(s.bayId)} selectedBayId={selectedBayId} />` (omit `quality` for auto tiers, or pass the wall PC's fixed `'med'`).
   Tray rows and search call `useSceneCamera().flyTo(bayId)` or `flyTo('floorOverview' | 'dockWall' | 'stagingAisle' | 'apron')`. `SceneSelection` is `{ kind: 'bay'; bayId }`; the scene never writes to a store.
3. **No vite.config change is required.** `scene-preview.html` is served by `pnpm dev` at `/scene-preview.html`; it is not a build input, so `pnpm build` is unchanged. Add `build.rollupOptions.input` only if it should ship.
4. **docs/04 section 2.1**: swap the E and W `faceYaw` signs (see Decision 1).
5. Lazy-load `src/scene` when mounting it; three, R3F and drei are about 1 MB raw and would otherwise land in the main chunk (docs/02 section 6 budget of 1.5 MB gzip).
6. For steps 7 and 8: `SceneLights` bakes contact shadows with `frames={1}`; set `frames={Infinity}` (or re-render on change) once actors move. `BoxInstances` takes items with palette keys, so status colours can be fed as `tone` plus instance updates without remounting.

## Not done / stubbed
Trucks, people, forklifts, belt items, boom animation, live binding, pins and pill labels, camera glyphs, event pins (steps 7 and 8). Canopy (`canopyDepth`) is not rendered (roofless interior focus). Work-zone plate is a fixed neutral tint until belt status is bound.
