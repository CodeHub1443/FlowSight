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
