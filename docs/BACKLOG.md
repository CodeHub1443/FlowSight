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
- [x] Task 06 · bell shows only last-3-h replayed alerts (45) vs KPI open alerts (79) → snapshot delivers all open events; bell and chip agree — mock done in 19.9b (D3): the connect backfill sends every open alert (cap 500); the real backend still has to deliver them (JetStream / snapshot)
- [ ] Task 06 · mode badge shows wall clock in MOCK mode → show simulated time
- [ ] Task 06 · demo looks quiet at peak (1/7 belts loaded, queue rarely > 1) → "Busy demo" scenario (shorter dock→start, higher arrival rate)
- [ ] Task 06 · enforce docs/03 §3.2 "a visit appears in exactly one of visit or queue" in simulator + test
- [ ] Task 04A · ~250 hygiene events/day → group alerts per visit in UI · step 9

## P1 — Next build steps
- [x] user · use NVIDIA SimReady assets (ADR-12): forklift, plastic pallets, crates, cartons, pallet truck, barcode scanner → asset pipeline task before step 7; CC-BY-4.0 attribution — pipeline done in Task 11 (ADR-13); attribution still open below
- [x] Task 11 · integrate the converted forklift, scanner and crate models into the live scene — forklift done in Task 14; scanner stays procedural (a 1,478-tri model for a palm-sized object) and the crate GLB unused, because staging crates are procedural
- [x] Task 11 · waiting and departing trucks: integrate `truck` GLB — superseded: GLB rejected by the owner, all trucks are the procedural van (Task 14)
- [x] Task 11 · docked trucks need a procedural open-rear van — done in Task 14
- [ ] Task 11 · optional: a purpose-built truck model (BD covered van), because the supplied mesh is AI-generated, lumpy up close and not a local vehicle · client decision
- [ ] Task 11 · `docs/ATTRIBUTION.md` and the About dialog (ADR-12) were not written: licensing was out of scope by owner decision; source paths are in `public/models/manifest.json`
- [x] Task 07A · default Floor overview leaves a large empty band above the dock wall and storage fills the bottom → tighter framing — superseded by the diagonal hero view (docs/06 D1, Task 09)
- [x] Task 07A · SCENE_SAFE_AREA top must be 160 (top bar + KPI row), bottom must account for the visit tracker (or collapse it by default) — done: 120 / 384 / 88 / 24 from the scene's top, compact tracker by default (`e2e/live-visual.spec.ts` enforces both)
- [x] step 7 · actors: trucks (BD covered van), people (captain full vest + scanner, worker cross-vest), forklifts, items on belts — done in Task 14
- [ ] Task 14 · **Intel UHD Med is below the 45 fps stop line with actors on: dark 39.1, light 45.4 mean with later runs at 41** (baseline 55.0 and 55.8; table in PROGRESS Task 14). Per-frame instance uploads are the likely main cost; GPU-driven animation is the option that removes them → user decision
- [ ] Task 14 · not built, outside the brief's list though in docs/04 section 3 or docs/05 step 7: boom extend/retract, belt UV scroll, camera glyphs · step 8
- [ ] Task 14 · a truck reversing or driving off passes through a truck parked in a holding slot: the slots lie across every door's path and the layout is frozen → user decision on the apron layout
- [ ] Task 14 · actors are not clickable yet (uiStore already has truck, person and forklift selections) · step 8
- [x] Task 04C · contact shadows baked once (frames=1) → update when actors move — not needed: actors stay out of that pass on their own layer and carry soft blob shadows (Task 14)
- [x] Task 08 · SceneRoot does not report automatic tier steps: the Low-tier card-blur fallback follows a pinned tier or the auto start tier only → `onTierChange` prop on SceneRoot (src/scene API change) — done Task 12
- [x] Task 08 · SCENE_SAFE_AREA top 160 is the viewport-measured chrome; inside the canvas the KPI row ends at 97 px (BN 105–108) → confirm 160 or tighten to ~112 (one constant + projection test) — done: 120
- [ ] Task 08 · at 16:9 the 45 m face is width-bound: the first storage rows still fill about the bottom quarter of the Floor overview → accept, or narrower cards / steeper default
- [x] Task 08 · CLAUDE.md and docs/04 still list the old brand placeholder `#1F36C7` and status values (`#16A34A`, `#2563EB`, …); the app uses docs/06 (`#2C6FED`, `--status-info` = brand-500) → align the docs — done Task 13: CLAUDE.md points to docs/06; docs/04 no longer lists them
- [x] Task 08 · Bangla turnaround KPI delta (`↑ ৭ মিনিট`) wraps to two lines inside the chip at 1920 → nowrap / shorter unit (`docs/screens/merge-03-live-1920x1080-bn-light.png`) — done: `whitespace-nowrap` on the delta, `expectNoKpiEllipsis` guards the row

## P2
- [x] Task 11 · `e2e/mockSim.ts` `startPeak` waits for a clock matching `19:[2-5]x`, which the wall clock itself satisfies from 19:20 to 19:59 Dhaka, so tests can select a truck before the restart wipes it → wait on the peak date or a restart signal — done Task 13: waits on the instant (`data-ts`) on the peak day
- [ ] Task 11 · GLB cartons have sharp edges against docs/06 D6 rounding (100-tri budget) → user decision after `docs/screens/t11-bay-light-en-1920x1080.png`
- [ ] Task 05 · e2e ~7 min on 1 worker (CPU WebGL) → tag scene specs, `pnpm e2e:fast` · step 14
- [x] Task 04B · inspector scrolls at 1366×768 with no fade hint · step 14 — done: `scroll-fade` on the inspector body
- [ ] Task 06 · internal /__mock/presence route has no role check · step 12
- [ ] Task 08 · `geometry.ts` onBeforeCompile `#include` replacements have no guard test (only the PCF shadow patch has one) → test that each replaced chunk name exists in the installed three
- [ ] Task 08 · `MockSource.test.ts` still builds 7-day histories under a 60 s budget → `new SimRuntime(host, { historyDays: 1 })` as in App/MockControls tests
- [ ] Task 08 · truck inspector title ellipsises the Bangla plate at 360 px (three header buttons); full plate is in the tray and tracker
- [x] vis-ui · pill text in docs/06 colours (e.g. `#E8890C` on `#FFF1DF`) is below WCAG AA at 12 px → docs/06 decision — done Task 09: `--*-ink` tokens (docs/06 section 7.3), enforced by `scripts/contrast.test.mjs`
- [ ] Task 04B · captain-name visibility per role pending client answer (docs/01 §9 item 4)

## Task 19 follow-ups (integration 19.9, 2026-11-03)
- [ ] T19 · **P0 Task 20: Performance tab in `/analytics`**: compare bays against comparable operations (direction, carton volume, crew size, shift length), with sample sizes and "insufficient data" states; no chart library before Task 20 (spec section 7)
- [ ] T19 · turnaround chip shows from 1700 px and PPE chip from 2000 px, so at 1366 and 1920 px some popovers are unreachable → consider a "More KPIs" overflow chip
- [ ] T19 · KPI popovers may overlap bays while open (decision D1, accepted); if users object: a camera offset while a popover is open (scene change, out of T19)
- [x] T19 · alert groups vs KPI "Needs attention": groups 40 vs 74 at peak start in 19.9 → done 19.9b (D3): mock backfill sends every open alert; e2e asserts groups = `kpi.openAlerts` per severity. Open: the bell counts *unread* alerts, so it equals the open count only until someone reads one; the real backend must also deliver all open events on connect
- [ ] T19 · `belt.low_throughput` (warn, abnormal drop in cartons/min): proposal to the backend, docs/03 changelog rev 1.1, not implemented
- [ ] T19 · backend (wh-api / state-engine) must implement contract rev 1.1: `kpi.turnaround`, `visit.skuCount`, `Visit.dwell.{waitForDockMin, preOpMin, occupancyMin}`, PPE-only `complianceScore`; until then the UI shows the legacy turnaround and "—"
- [ ] T19 · 5 s unit-test timeouts under load (App ×2+, alertStore retention, simulation 7-day and retention, MockControls; LiveOverlay.flicker at its own 30 s) → per-file timeouts or lighter histories; all pass with `--testTimeout=60000` or alone
- [ ] T19 · `pnpm e2e:fast` (tag scene-heavy specs; see the Task 05 P2 line); also: Radix exit animations start seconds late under SwiftShader after a canvas click, so e2e waits up to 20 s for a closed popover to unmount
- [x] T19 · "Trucks on site" and "Bays running" chips have no row in the metric admission table (t19-spec section 3) → done 19.9b (D4): rows added, plus Bay: PPE violations now and Bay: today cartons / trucks / avg TAT

## Task 20 follow-ups (base 20.0, 2026-11-04)
- [ ] Soak harness · geometry criterion compares the **baseline (minimum) per third** of the run instead of the peak
- [ ] Soak harness · mark a run **INVALID** (not FAIL) when samples are throttled (median fps under 10, or the foreground process is not chrome) or when sample gaps exceed 5 minutes
- [ ] Soak harness · the fps-drop criterion uses valid windows only
- [ ] Soak harness · regenerate `chart.png` on Ctrl+C
- [ ] Soak harness · simulated-user actions "open a KPI popover" and "open the Performance tab"
- [ ] Soak harness · then a 100-minute run mostly at 60x (`--phases=10m@1,90m@60`) to reach the alert-store cap
- [ ] T19 · "No truck" is shown three times in the empty bay inspector → once
- [ ] T20 · backend (wh-api / state-engine) must implement contract rev 1.2 (`GET /analytics/bay-performance`, docs/03 section 4.4) with the same definitions; until then the Performance widgets show their error state against a live backend

## Client open items (docs/01 §9)
- [ ] Shift timings · [ ] mandatory PPE · [ ] SKU class list · [ ] roster source · [ ] real door pitch / bay order · [ ] brand kit · [ ] Telegram egress · [ ] transporter list
