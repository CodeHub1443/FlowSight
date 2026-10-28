# Backlog

Deferred items. Each line: source · item · target. The main session moves items into briefs; lines get ticked, never deleted.
Priority: **P0** = next task · P1 = soon · P2 = later.

## P0 — Visual quality pass (user review 2026-10-26)
Spec: `docs/06-visual-language.md`. Evidence: `docs/screens/step-merge-02-live-1920x1080-en.png`, `docs/screens/step-06-bay-4.png`.
- [x] user · colours must match the reference video: pale periwinkle/white world, saturated brand blue, soft carton tones — current floor is grey-green and walls dull grey · docs/06 §1 — done `e316ca7` (scene palette) + `0a00b74` (CSS tokens); CSS ↔ scene mirror test-enforced in Task 08 integration (uncommitted, see PROGRESS "Merge 03")
- [x] user · 3D objects look flat with sharp edges (plain boxes for pallets, cabinets, door frames, walls) → rounded/bevelled geometry, cartons with tape, pallets with slots, conveyors with rollers and rounded ends · docs/06 §2 — done `e316ca7`
- [x] user · no depth/softness → ambient occlusion (N8AO), environment lighting from local Lightformers, soft shadows, PBR Neutral tone mapping · docs/06 §2 + ADR-11 — done `e316ca7`
- [ ] user · overall look "cartoonish/2D" → materials, lighting and proportions per docs/06 §2; side-by-side check against the reference — implemented `e316ca7`; open until the user signs off `docs/screens/merge-03-compare.png`
- [x] user · UI cards low quality vs video → radius 16, two-layer soft shadow, backdrop blur, 44 px tinted icon tiles, calmer typography (no shouting caps), tinted pills · docs/06 §3 — done `0a00b74`; Bangla 600 weight bundled in Task 08 integration (uncommitted, see PROGRESS "Merge 03")
- [x] user · UI components flicker → diagnose with React Profiler; stable keys, memoised rows, tabular numbers, fixed min-widths, number tweening, no remounts · docs/06 §4 — done `0a00b74` (profiler 0 mounts/unmounts in steady state; `LiveOverlay.flicker.test.tsx`, `e2e/live-flicker.spec.ts`)
- [x] user · UI should feel smooth → eased camera fly-to, 150–200 ms transitions, objects fade in, no layout jumps · docs/06 §2–3 — done `e316ca7` (fly-to, fade-in) + `0a00b74` (transitions, tweens, FLIP)
- [x] Task 05 · B01 hidden behind inspector + tray (1366 and partly 1920) → camera view offset / safe-area so no bay is covered · docs/06 §2 — done `e316ca7` (setViewOffset) + Task 08 integration (uncommitted, see PROGRESS "Merge 03") (projection test + real-GPU pill check at both sizes)
- [x] Task 05 · hard-coded colours outside materials.ts (label plates, door-plate text, contact-shadow tint) → tokens — done `e316ca7`
- [x] Task 05 · auto quality stepping disabled on /live (fixed 'med') → default "auto" — done `e316ca7` (LiveScene) + Task 08 integration (uncommitted, see PROGRESS "Merge 03") (uiStore `quality: 'auto'`)
- [x] Task 04C · conveyors slimmer than the real EZ machines; pallets solid blocks → see docs/reference/cam-*.jpg for proportions — done `e316ca7`
- [x] Task 05 · comment in transforms.ts still states old E/W yaw signs — done `e316ca7`

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
- [ ] Task 08 · SceneRoot does not report automatic tier steps: the Low-tier card-blur fallback follows a pinned tier or the auto start tier only → `onTierChange` prop on SceneRoot (src/scene API change)
- [ ] Task 08 · SCENE_SAFE_AREA top 160 is the viewport-measured chrome; inside the canvas the KPI row ends at 97 px (BN 105–108) → confirm 160 or tighten to ~112 (one constant + projection test)
- [ ] Task 08 · at 16:9 the 45 m face is width-bound: the first storage rows still fill about the bottom quarter of the Floor overview → accept, or narrower cards / steeper default
- [ ] Task 08 · CLAUDE.md and docs/04 still list the old brand placeholder `#1F36C7` and status values (`#16A34A`, `#2563EB`, …); the app uses docs/06 (`#2C6FED`, `--status-info` = brand-500) → align the docs
- [ ] Task 08 · Bangla turnaround KPI delta (`↑ ৭ মিনিট`) wraps to two lines inside the chip at 1920 → nowrap / shorter unit (`docs/screens/merge-03-live-1920x1080-bn-light.png`)

## P2
- [ ] Task 05 · e2e ~7 min on 1 worker (CPU WebGL) → tag scene specs, `pnpm e2e:fast` · step 14
- [ ] Task 04B · inspector scrolls at 1366×768 with no fade hint · step 14
- [ ] Task 06 · internal /__mock/presence route has no role check · step 12
- [ ] Task 08 · `geometry.ts` onBeforeCompile `#include` replacements have no guard test (only the PCF shadow patch has one) → test that each replaced chunk name exists in the installed three
- [ ] Task 08 · `MockSource.test.ts` still builds 7-day histories under a 60 s budget → `new SimRuntime(host, { historyDays: 1 })` as in App/MockControls tests
- [ ] Task 08 · truck inspector title ellipsises the Bangla plate at 360 px (three header buttons); full plate is in the tray and tracker
- [ ] vis-ui · pill text in docs/06 colours (e.g. `#E8890C` on `#FFF1DF`) is below WCAG AA at 12 px → docs/06 decision
- [ ] Task 04B · captain-name visibility per role pending client answer (docs/01 §9 item 4)

## Client open items (docs/01 §9)
- [ ] Shift timings · [ ] mandatory PPE · [ ] SKU class list · [ ] roster source · [ ] real door pitch / bay order · [ ] brand kit · [ ] Telegram egress · [ ] transporter list
