# 06 — Visual Language (binding for all UI and 3D work)

Reference: `docs/reference/video/*.jpg` and `docs/reference/ui-ref-*.jpg`. Target feel: **soft, bright, toy-like-but-premium
3D** — rounded objects, gentle ambient shadowing, a pale periwinkle world with saturated blue accents, and white floating cards
that look lifted off the page. Not flat, not cartoonish, not sharp-edged. Every value below is a token; nothing is hard-coded.

## 1. Colour (light theme; sampled from the reference frames)
| Token | Value | Use |
|---|---|---|
| `--scene-void` | `#E6ECFA` | background beyond the shed |
| `--scene-floor` | `#EEF2FC` | shed floor (pale periwinkle-white, NOT grey-green) |
| `--scene-floor-line` | `#D4DEF7` | floor grid / zone outlines |
| `--scene-apron` | `#DCE4F8` | apron paving |
| `--scene-walkline` | `#F2C94C` | painted lines (thin, slightly desaturated) |
| `--scene-wall` | `#F7F9FE` | walls, cutaway tops |
| `--scene-wall-accent` | `#3D6AE4` | dock wall band, door frames, cap line |
| `--brand-500` | `#2C6FED` | primary blue (conveyor frames, active states, progress) |
| `--brand-400` | `#5193F3` | lighter blue faces (top surfaces of blue objects) |
| `--brand-50` | `#EAF2FF` | icon tiles, selected rows, info pill background |
| `--carton` | `#E9C6A2` / tape `#D9AE80` | cartons |
| `--pallet-blue` `--pallet-yellow` `--pallet-orange` | `#3F7BF0` `#F5C542` `#F59E5B` | plastic pallets/crates |
| `--metal` | `#C9D2E3` | steel guides, cabinets |
| `--belt` | `#2E3445` | belt surface |
| `--ok` / bg | `#22AF5B` / `#E3F6EA` | Running / In-stock style pills |
| `--warn` / bg | `#E8890C` / `#FFF1DF` | warn pills |
| `--critical` / bg | `#E5484D` / `#FDE8E8` | critical |
| `--ink-900` `--ink-600` `--ink-400` | `#0F172A` `#475569` `#94A3B8` | text |
| `--card` | `#FFFFFF` at 92% over a 12px backdrop blur | cards |
Dark theme mirrors these with a deep navy void `#0B1222`, floor `#141C2F`, cards `#121A2B` at 90%.

## 2. 3D rendering rules
- **No sharp boxes.** Every box-like object uses rounded geometry (drei `RoundedBox`, radius 3–8% of the smallest side, smoothness 4)
  or a bevelled extrusion. Cartons get a tape strip; pallets get slots; conveyors get rollers/side guides with rounded ends.
- **Ambient occlusion is required** for the soft depth seen in the reference: N8AO (via `@react-three/postprocessing`) on High/Med,
  plus SMAA. Low tier: no post, baked `ContactShadows` only. (Supersedes ADR-10; see ADR-11 in docs/02.)
- **Lighting:** drei `Environment` built from local `Lightformer`s (no HDR download — offline rule), one soft key light with
  `shadow.radius` ≥ 6 and `bias` tuned (no acne), hemisphere fill. Tone mapping **Khronos PBR Neutral** (`THREE.NeutralToneMapping`), exposure ~1.0, sRGB output — ACES/AgX grey out the §1 palette (measured: floor #EEF2FC → #DDDEE1 ACES / #C4C6C9 AgX), Neutral keeps it within a few RGB units.
- **Materials:** `MeshStandardMaterial`, roughness 0.55–0.75, metalness 0 except steel (0.4). Top faces read lighter than side faces
  (achieved by lighting, not by different colours). No pure black anywhere; darkest scene colour is the belt `#2E3445`.
- **Camera:** FOV 26–30°, slightly isometric; default framing shows all 7 bays with margins so cards never cover a bay
  (use `camera.setViewOffset` / safe-area padding equal to the card column widths).
- **Labels in 3D:** pill labels (white, 999px radius, soft shadow, small icon) — never billboard-text slabs. Bay numbers as clean pills on the dock wall band.
- **Motion:** camera fly-to eased (`easeInOutCubic`, 700–900 ms); belts scroll smoothly; no popping — objects fade/scale in over 200 ms.

## 3. 2D UI rules
- **Cards:** radius 16 px (inner tiles 12 px, pills 999 px); padding 16–20 px; shadow = two layers
  `0 1px 2px rgba(15,23,42,.06), 0 8px 24px rgba(44,111,237,.10)`; 1 px border `rgba(15,23,42,.06)`; backdrop blur 12 px.
- **KPI chips:** 44 px icon tile (`--brand-50` bg, `--brand-500` icon) on the left; label 12 px `--ink-600` regular (not shouting caps);
  value 24 px semibold `--ink-900`; delta with arrow in `--ok`/`--critical`; sub-line 11 px `--ink-400`. Min width so values never reflow.
- **Typography:** Inter (Latin) and Noto Sans Bengali; weights 400/500/600 only; **`font-variant-numeric: tabular-nums` on every number**.
- **Pills:** tinted background + coloured text (e.g. `--ok` on `--ok bg`), 12 px medium, 4×10 px padding.
- **Lists/tray:** 56 px rows, 12 px radius hover/selected background `--brand-50`, small leading status dot, right-aligned mini progress bar.
- **Icons:** lucide, 1.75 stroke, 18–20 px.
- **Motion:** 150–200 ms ease-out for hover/press/open; numbers **tween** (300 ms) instead of jumping; panels slide+fade 200 ms.

## 4. No flicker (hard requirement)
- Live updates must never remount components, change keys, reorder rows unexpectedly, or change layout size.
- Stable keys (ids), memoised rows (`React.memo` + selector equality), tabular numbers, fixed min-widths, skeletons only on first load.
- Lists re-sort at most every 5 s and animate position changes (FLIP), or keep a stable order (by bay id) by default.
- 3D `Html` overlays: reuse elements, no unmount/remount per update; prefer sprite/SDF labels for many objects.
- Verify with React Profiler: at 60x mock speed, the overlay components commit ≤ 4×/s and no component unmounts during steady state.

## 5. Acceptance by eye
Side-by-side screenshot of `/live` next to `docs/reference/video/ui-ref-t09.jpg` (or the closest frame): same brightness, same blue,
same softness of shadows, rounded objects, card styling indistinguishable in quality. The user signs off visually.

## 7. Reference delta analysis (2026-10-28) — binding, overrides §1–§3 where they conflict
Source frames: `docs/reference/video/ui-ref-key.png` (user-supplied key frame) vs `docs/screens/merge-03-live-1920x1080-*.png`.
Sampled values are 5×5 averages from the key frame.

### 7.1 Why ours still reads "floor plan" and the reference reads "miniature world"
| # | Reference | Ours (merge-03) | Required change |
|---|---|---|---|
| D1 | **Diagonal 3/4 view**: camera ~38° elevation, ~40° azimuth off the building's long axis; building recedes diagonally; strong perspective depth | Straight-on, ~60° elevation, symmetric grid of 7 identical bays → reads like a plan | Default `Floor overview` becomes a **diagonal hero view**: elevation 36–42°, azimuth 30–40° from the dock-wall normal (looking from inside-north-east toward the south-west), all 7 bays visible receding along the diagonal; FOV 28°. The straight-on view stays as preset `Plan`. |
| D2 | **Shadows and AO are periwinkle-blue**, never grey: shadow on ground `#AFC1F4` over ground `#D4E0F9` | Neutral grey/black shadows and AO | Hemisphere ground colour `#9FB4F0`; N8AO `color` `#8EA6EC`; contact-shadow colour `#7F98E6` at 0.35 opacity; key light slightly warm `#FFF6EC`. Nothing in shadow may drop below `#8FA3D9` (light theme). |
| D3 | **Two-tone ground**: open paving `#E5E8F7`, zones `#D4E0F9`, roads `#B9CCF6`, outlined bays with thin yellow lines; lots of breathing space | One flat floor colour, dense props everywhere | Floor `#E8ECF8`; bay work-zone + staging plates `#D7E2FA` with 6 cm rounded inset edge; forklift aisle `#C9D7F7`; yellow outlines only around bay plates and aisle (thin, `#F2C94C`). |
| D4 | **No heavy darks**: darkest large area is a saturated blue (`#1C47AC`), dark only in tiny details | Belt `#222C43` near-black stripes dominate every bay; dock-wall door gaps dark grey | Belt `#3A4A73` with a lighter centre stripe `#4A5C8A` and visible roller ticks; door openings show the bright apron (`#DCE4F8`), not dark grey. |
| D5 | **Walls pale blue-white with vertical panel ribs**, saturated blue frames/eaves; side faces in shadow `#BBC9E6` | Mid-grey dock wall `#74746D`, flat | Dock wall `#F3F6FE` with 1.2 m vertical rib lines `#DCE4F8`; door frames `--brand-500` 18 cm thick, rounded; eave/band `#3D6AE4` with a lighter top face `#6EA7F9`. |
| D6 | **Chunky toy proportions**: thick rounded edges (radius ≈ 10–15 % of smallest side), slightly oversized props | Thin rails, small props, many tiny items | Bevel radius 10–15 % on all props; conveyor frame 20 % chunkier; staging shows **3–5 larger pallet stacks per bay**, not 10–15 small ones; storage area reduced to 2 low rows at the far edge or faded into the void (no giant foreground cartons). |
| D7 | **Atmosphere**: the world fades softly into the periwinkle void; slight vignette | Hard building edge on a flat void | Distance fog from 60 m to 140 m into `--scene-void`; radial vignette in the post stack (offset 0.35, darkness 0.25, light theme only, tinted toward `#C7D3F5`). |
| D8 | **Selection**: blue wireframe bracket box with corner ticks around the object + translucent blue floor glow; **dark-blue filled pill** (`#2C5BD8`, white text) `TRK-2205 · Unloading` | Thick blue rectangle outline on floor + white pill | Selection = corner-bracket box (8 corner L-ticks, 2 px, `--brand-500`) + floor glow (radial, `--brand-500` at 18 %); selected-object pill = filled `#2C5BD8`, white 12 px semibold + lighter sub-label; unselected bay pills stay white. |
| D9 | **Event pins**: tall blue teardrop map pins with a white core, gently bobbing | none yet | Build the pin component now (used by step 9): 1.2 m teardrop, `--brand-500`, white core, soft shadow, 1.2 s bob. |
| D10 | **Map controls**: white vertical pill on the scene's right edge (+, −, rotate-left, rotate-right, home) | none | Add the control pill to the left of the inspector column (inside the safe area edge), docs/06 §3 card style. |

### 7.2 2D deltas
| # | Reference | Ours | Required change |
|---|---|---|---|
| U1 | KPI icon tile is a **solid saturated blue rounded square (`#2F64E9`) with a white 3D-ish glyph** | Pale `--brand-50` tile with blue line icon | Tile 48 px, radius 12, fill gradient `#3B7BF6 → #2A5FE0`, white icon 22 px with a 1 px top highlight. |
| U2 | Values **bold** (~26 px, weight 700), labels 13 px weight 500 `--ink-600`, unit/subline 12 px | 24 px semibold values, lighter labels | Allow weight 700 for KPI values and card titles; values 26 px; label 13/500. (Overrides §3 "400/500/600 only".) |
| U3 | Cards: radius 14, **almost no border**, shadow soft and wide `0 10px 30px rgba(31,64,160,.12)`, pure white fill | Hairline border + two-layer shadow, blur | Radius 14; border `rgba(31,64,160,.05)`; shadow `0 1px 2px rgba(31,64,160,.06), 0 10px 30px rgba(31,64,160,.12)`; fill white 96 %. |
| U4 | Page/top bar tint `#E9EAF0`-ish with white search pill (full radius) and site chip with a **blue square badge** | White top bar | Top bar transparent over a `#EEF1F9` page tint; search full-pill white; site chip with 28 px blue badge (`WH`-style code `DHK`). |
| U5 | Inspector: small blue caps caption (`WARETRACK FREIGHT` style, 11 px, letter-spacing .06em, `--brand-500`), 20 px bold title, **thick 6 px green progress bar** with rounded ends, value rows 13 px with right-aligned semibold values, links in blue | Similar but thinner bar, lighter title | Caption style as described; title 20/700; progress 6 px; row separators `rgba(15,23,42,.06)`. |
| U6 | Tray: **segmented tabs** inside a light pill track, active tab white with shadow; rows 40–44 px dense with bold ids, status pill, mini green bar | Taller rows, plain tabs | Segmented control; rows 48 px; id bold 13 px; mini progress 36×4 px. |
| U7 | Tracker: 40 px step circles, completed = solid blue with white icon, current = blue ring with soft halo, future = grey ring; times under labels; shipment mini-card on the right with a truck illustration | Smaller steps | Steps 40 px; halo `0 0 0 6px rgba(44,111,237,.15)` on current; mini-card with icon tile. |

### 7.3 Values changed while implementing §7 and §8 (Task 09)
The values above and in §8 stay as written except for these, each forced by a measurement. Status fills, ink and the dark pill come from the WCAG AA requirement of §8.4 (4.5:1 text, 3:1 graphics), which `src/lib/contrast.test.ts` now enforces.
| Token / value | Spec | Now | Why |
|---|---|---|---|
| `--ink-400` (light text) | `#94A3B8` | `#5F6E85` | 2.56:1 on a card |
| tertiary text (dark, §8.4) | `#6F7DA6` | `#98A5CA` | 3.94:1 on the card, 3.83:1 on a selected row |
| `--ok` fill (light) | `#22AF5B` | `#1FA653` | 2.86:1 on a card as a graphic |
| `--warn` fill (light) | `#E8890C` | `#D87C00` | 2.62:1 on a card as a graphic |
| Selected bay pill fill (dark, §8.4) | `#3E73FF` | `#3468F0` | 4.12:1 with white text |
| Status text on pills | §1 `--ok` etc. | new `--ok-ink` `#14753A`, `--warn-ink` `#A85B00`, `--critical-ink` `#C42B30`, `--neutral-ink` `#556377`, `--info-ink` `#1F5AD0` (dark: the §8.4 pill colours) | §1 colours are 2.5:1 on their own tint; fills keep §1 |
| Dark pill and row fills (§8.4) | `rgba(...)` | the same colour composited over the card, as a hex token | every scene-readable token stays a plain hex; identical on a card |
| Fog (D7, §8.3) | light 60–140 m, dark 50–120 m | light 85–170 m, dark 75–150 m | the hero camera stands 75–105 m from the bays, so the specified range washed out the props in view |
| Dark tone mapping (§2) | Neutral | none (linear) | Neutral's toe subtracts the darkest channel below 0.08 linear, turning the §8 palette saturated blue and hiding the warm pools |
| Dark light intensities (§8.3) | key 0.8, hemisphere 0.55, rim 0.6 | key and hemisphere × 1.35 π, rim × π | three.js lights divide by π; calibrated so the floor renders near `#1E2E58` |
| Work-light pools (§8.3) | a spot per bay, decal on Low only | floor pool on every tier, spots on High only | seven spot lights took Med from 52 to 45 fps (p95 24 to 42 ms) on Intel UHD, and a warm lamp barely shows on a blue floor anyway |
| Vignette (D7) | "in the post stack" | a CSS radial gradient over the canvas | the post `Vignette` effect can only darken, not tint towards `#C7D3F5`, and it would miss the Low tier |

## 8. Dark theme — "night shift" design (binding)
Goal: a night-shift control room, **not** a black screen. Readability comes from **value layering** (each layer clearly lighter than
the one behind it), **cool rim light** to separate silhouettes, **warm work-light pools** over active bays, and **saturation kept on
the meaningful colours** (status, brand, cartons). Nothing large is darker than the void; nothing large is pure black.

### 8.1 Layers (darkest → lightest)
| Layer | Token | Value |
|---|---|---|
| Void / background | `--scene-void` (dark) | `#0E1730` (deep indigo-navy, not black) with a radial glow `#16244A` behind the shed |
| Apron / outside | `--scene-apron` | `#17244A` |
| Shed floor | `--scene-floor` | `#1E2E58` — clearly lighter than the void so the building reads as a lit object |
| Bay plates / staging zones | `--scene-zone` | `#25386A` with outline `#3A5596` |
| Forklift aisle | `--scene-aisle` | `#1A2850` with dashed lines `#E8B93C` at 70 % |
| Walls / cutaway tops | `--scene-wall` | sides `#2A3B68`, tops `#3B5190` (tops lighter = reads 3D) |
| Dock band / frames | `--scene-wall-accent` | `#3E73FF` emissive 0.15 |

### 8.2 Objects
| Object | Value |
|---|---|
| Conveyor frame | `#4C7DFF` (top faces `#6E95FF`), slight emissive 0.08 |
| Belt | `#2B3863`, centre stripe `#3A4A7E`, roller ticks `#5266A6` |
| Cartons | `#C99D72` (warm against the cool scene — the key contrast), tape `#B0845C` |
| Sacks | `#D9E1F2` with a brand stripe |
| Plastic pallets / crates | blue `#4A7FF5`, yellow `#E8B93C`, orange `#E98A4F` (saturated, slightly lifted) |
| Steel / cabinets | `#8A9BC4` with metalness 0.4 |

### 8.3 Lighting (dark)
- Hemisphere: sky `#6F86C9`, ground `#1A2650`, intensity 0.55.
- Key (moon/skylight): `#B9C8FF`, intensity 0.8, soft shadows; shadows tinted `#0F1A3A`, never black.
- **Rim light**: back-right, `#7EA2FF`, intensity 0.6 — edges of conveyors, pallets and walls catch a cool highlight.
- **Work-light pools**: one soft spot per bay above the belt mouth (`#FFE3B0`, intensity scaled by belt status: running 1.0, empty 0.6, stopped 0.3, no truck 0.15, offline 0) — active bays glow warm, idle bays dim. Low tier: replace with an emissive floor decal.
- AO colour `#0A1330`; fog `#0E1730` from 50 m to 120 m; no vignette darker than the void.
- Status emissives (bay plate, belt strip) at 0.6 intensity so status reads at a glance.

### 8.4 Dark UI
| Element | Value |
|---|---|
| Page behind cards | transparent over the scene; top bar `rgba(14,23,48,.72)` + blur |
| Card | `rgba(22,32,62,.86)`, blur 14 px, border `rgba(140,165,255,.14)`, shadow `0 10px 30px rgba(0,0,0,.35)`, inner top highlight `inset 0 1px 0 rgba(255,255,255,.04)` |
| Text | primary `#E8EDFF`, secondary `#A3B0D6`, tertiary `#6F7DA6` |
| Icon tiles | same saturated blue gradient as light (`#3B7BF6 → #2A5FE0`) — they pop on navy |
| Pills | ok `#3DDC84` on `rgba(61,220,132,.14)`; warn `#FFB547` on `rgba(255,181,71,.14)`; critical `#FF6B6B` on `rgba(255,107,107,.16)`; info `#7EA2FF` on `rgba(126,162,255,.16)` |
| Rows hover/selected | `rgba(126,162,255,.10)` / `.16` |
| Bay pills in 3D | `#1C2A55` fill, `#E8EDFF` text, border `rgba(140,165,255,.25)`; selected = `#3E73FF` fill |
All pairs must meet WCAG AA (4.5:1 text, 3:1 large/graphics) — verify with a test that computes contrast for every token pair used.

### 8.5 Acceptance (dark)
Side-by-side light/dark screenshots: in dark, every bay, belt, pallet stack and card is distinguishable at a glance from 2 m;
the shed floor is visibly lighter than the void; active bays are warmer/brighter than idle ones. The user signs off.
