# Backlog

Deferred items. Each line: source · item · target. The main session moves items into briefs; lines get ticked, never deleted.
Priority: **P0** = next task · P1 = soon · P2 = later.

## P0 — Visual quality pass (user review 2026-10-26)
Spec: `docs/06-visual-language.md`. Evidence: `docs/screens/step-merge-02-live-1920x1080-en.png`, `docs/screens/step-06-bay-4.png`.
- [ ] user · colours must match the reference video: pale periwinkle/white world, saturated brand blue, soft carton tones — current floor is grey-green and walls dull grey · docs/06 §1
- [ ] user · 3D objects look flat with sharp edges (plain boxes for pallets, cabinets, door frames, walls) → rounded/bevelled geometry, cartons with tape, pallets with slots, conveyors with rollers and rounded ends · docs/06 §2
- [ ] user · no depth/softness → ambient occlusion (N8AO), environment lighting from local Lightformers, soft shadows, PBR Neutral tone mapping · docs/06 §2 + ADR-11
- [ ] user · overall look "cartoonish/2D" → materials, lighting and proportions per docs/06 §2; side-by-side check against the reference
- [ ] user · UI cards low quality vs video → radius 16, two-layer soft shadow, backdrop blur, 44 px tinted icon tiles, calmer typography (no shouting caps), tinted pills · docs/06 §3
- [ ] user · UI components flicker → diagnose with React Profiler; stable keys, memoised rows, tabular numbers, fixed min-widths, number tweening, no remounts · docs/06 §4
- [ ] user · UI should feel smooth → eased camera fly-to, 150–200 ms transitions, objects fade in, no layout jumps · docs/06 §2–3
- [ ] Task 05 · B01 hidden behind inspector + tray (1366 and partly 1920) → camera view offset / safe-area so no bay is covered · docs/06 §2
- [ ] Task 05 · hard-coded colours outside materials.ts (label plates, door-plate text, contact-shadow tint) → tokens
- [ ] Task 05 · auto quality stepping disabled on /live (fixed 'med') → default "auto"
- [ ] Task 04C · conveyors slimmer than the real EZ machines; pallets solid blocks → see docs/reference/cam-*.jpg for proportions
- [ ] Task 05 · comment in transforms.ts still states old E/W yaw signs

## P1 — Data / simulator polish
- [ ] Task 06 · simulator core ships in live-mode entry chunk → dynamic import MockSource in the factory
- [ ] Task 06 · bell shows only last-3-h replayed alerts (45) vs KPI open alerts (79) → snapshot delivers all open events; bell and chip agree
- [ ] Task 06 · mode badge shows wall clock in MOCK mode → show simulated time
- [ ] Task 06 · demo looks quiet at peak (1/7 belts loaded, queue rarely > 1) → "Busy demo" scenario (shorter dock→start, higher arrival rate)
- [ ] Task 06 · enforce docs/03 §3.2 "a visit appears in exactly one of visit or queue" in simulator + test
- [ ] Task 04A · ~250 hygiene events/day → group alerts per visit in UI · step 9

## P1 — Next build steps
- [ ] user · use NVIDIA SimReady assets (ADR-12): forklift, plastic pallets, crates, cartons, pallet truck, barcode scanner → asset pipeline task before step 7; CC-BY-4.0 attribution
- [ ] Task 07A · default Floor overview leaves a large empty band above the dock wall and storage fills the bottom → tighter framing
- [ ] Task 07A · SCENE_SAFE_AREA top must be 160 (top bar + KPI row), bottom must account for the visit tracker (or collapse it by default)
- [ ] step 7 · actors: trucks (BD covered van), people (captain full vest + scanner, worker cross-vest), forklifts, items on belts — built in the docs/06 style from the start
- [ ] Task 04C · contact shadows baked once (frames=1) → update when actors move · step 8

## P2
- [ ] Task 05 · e2e ~7 min on 1 worker (CPU WebGL) → tag scene specs, `pnpm e2e:fast` · step 14
- [ ] Task 04B · inspector scrolls at 1366×768 with no fade hint · step 14
- [ ] Task 06 · internal /__mock/presence route has no role check · step 12
- [ ] Task 04B · captain-name visibility per role pending client answer (docs/01 §9 item 4)

## Client open items (docs/01 §9)
- [ ] Shift timings · [ ] mandatory PPE · [ ] SKU class list · [ ] roster source · [ ] real door pitch / bay order · [ ] brand kit · [ ] Telegram egress · [ ] transporter list
