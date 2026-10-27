# Task 07B: 2D UI quality pass + flicker elimination (parallel worktree `visui`, branch `vis-ui`)

Baseline `815921f`, clean tree at start (verified). Nothing committed. Only owned paths were edited.
Binding spec: `docs/06-visual-language.md` §1, §3, §4, §5. Target frames: `docs/reference/video/*.jpg`, `docs/reference/ui-ref-*.jpg`.

## Log
1. **Before evidence.** `docs/screens/vis-ui-before.png`: 1920x1080 EN light on the baseline code. The e2e-produced copy was damaged by
   a line-ending fix of mine, so the file is the frame captured on the same baseline code during the profiler baseline run
   (dev build, 1920x1080, peak day, 60x). Profiler baseline: see below.
2. **Tokens** (`src/index.css`): docs/06 §1 for light and dark. Brand 500/400/50, ink 900/600/400, status colour + tinted background
   (ok/warn/critical from the doc; neutral/idle/offline/info backgrounds added to complete the set), card (92 %, dark 90 %, 12 px blur,
   hairline border, two-layer shadow, 16 px radius, 12 px tiles), every scene token at the exact doc value, motion tokens,
   `--shadow-raised`, `--shadow-topbar`, `--on-solid`, `--scrim`. Utilities `card-surface` and `soft-transition`. No literal colour
   remains in any owned TS/TSX file.
3. **Common components** (`src/components/common`): `FloatingCard` (card surface), new `IconTile` (44 px tinted tile), new `Caption`
   (12 px calm label; replaces the all-caps `SmallCaps`, which is deleted), tinted `StatusPill` (no dot), `ThinProgress` (fill always
   mounted, 300 ms width tween), hairline `KeyValue`, `CollapsiblePanel` (round chevron, body slides/fades in), new `Num` (300 ms number
   tween written to the DOM from rAF, width reserved in `ch`), new `useFlip` (FLIP position animation, no React renders).
4. **shadcn restyle** (`src/components/ui`): button (10 px radius, hairline outline, 150 ms ease-out, press scale, 18 px / 1.75 stroke
   icons), dropdown (14 px radius, card shadow), tooltip, badge, dialog/sheet scrim token.
5. **/live** rebuilt to the reference: KPI chips, tray (segmented tabs, 56 px rows), visit tracker (reference stepper + subject card),
   inspector (type icon tile, blue type label, round actions), top bar (search pill with `/`, site tile, tinted mode pill, segmented
   EN/বাং, ghost icons, avatar).
6. **Flicker** fixes (table §4) and two automated tests.
7. **Root font is 14 px**, so Tailwind's rem spacing is 87.5 % of nominal (`end-6` = 21 px, `size-11` = 38.5 px). Every docs/06 and
   safe-area dimension is therefore pinned in px (`size-[44px]`, `h-[56px]`, `end-[24px]`, pill `px-[10px] py-[4px]` ...). The global
   spacing scale was not changed (that would move every other route).
8. **After evidence**: 8 screenshots, composite, profiler re-run, e2e.

## Layout contract with the 3D session (safe area `{ top: 112, right: 384, bottom: 24, left: 24 }`)
| Element | Rule | Where |
|---|---|---|
| KPI chips | one row: 16 px margin + 86 px chip = 102 px (BN about 107 px) ≤ 112 | `src/features/live/LivePage.tsx:25`, `KpiChips.tsx:91` |
| Right column | 360 px wide, 24 px from the edge (384 total), inspector above tray | `LivePage.tsx:28` |
| Visit tracker | bottom-left, 24 px margins, `min(820px, 100% - 432px)` wide, about 130 px tall (≤ 140), collapsible | `LivePage.tsx:34` |
| Narrow screens | 6 chips from 1800 px, 5 from 1700 px, 4 below (turnaround and compliance are also in the depot inspector) | `KpiChips.tsx:176`, `:193` |
Asserted by `e2e/live-visual.spec.ts` (`expectLayoutContract`) at 1920x1080 and 1366x768, EN and BN: **passes**.

## docs/06 evidence (file:line)
### §1 Colour
| Rule | Evidence |
|---|---|
| brand / ink / status tokens (exact values) | `src/index.css:12-45` |
| scene tokens (exact values), aliases still read by `scene/materials.ts` | `src/index.css:73-97` |
| dark: void `#0B1222`, floor `#141C2F`, card `#121A2B` at 90 % | `src/index.css:155`, `:156`, `:171`, `:144` |
| no literal colours in owned TS/TSX | `grep -E "#hex|rgba(|text-white|bg-black"` over the owned dirs returns nothing |
| scene still reads valid hex through the aliases | checked in Chromium: `getComputedStyle` returns e.g. `--scene-floor-grid=#d4def7`, `--status-ok=#22af5b` (light) and the dark values |

### §3 2D UI
| Rule | Evidence |
|---|---|
| Card radius 16, two-layer shadow, 1 px hairline, 12 px blur, 92 % | `src/index.css:49-61`, `:273-281`; `FloatingCard.tsx:6` |
| Padding 16-20 px | inspector `InspectorFrame.tsx:48` (16 px); chips 12/16 px (`KpiChips.tsx:91`) so the chip fits the 112 px safe area |
| KPI 44 px icon tile, brand-50 / brand-500 | `IconTile.tsx:6`, `KpiChips.tsx:95` |
| KPI label 12 px ink-600, no caps | `KpiChips.tsx:97` |
| KPI value 24 px semibold ink-900 | `KpiChips.tsx:99` |
| Delta with arrow in ok / critical | `KpiChips.tsx:23-62` (one `ArrowUp`, rotated for down, `:50`) |
| Sub-line 11 px ink-400 | `KpiChips.tsx:104` |
| Min width so values never reflow | equal-share chips `KpiChips.tsx:91`; reserved number width `KpiChips.tsx:128`, `Num.tsx:69` |
| Inter + Noto Sans Bengali, weights 400/500/600 only | `font-bold` removed from every owned file |
| `tabular-nums` on every number | `src/index.css:300` (body) and on value spans |
| Bangla line-height, nothing clips | `src/index.css:316` (`:lang(bn) .truncate`, `.bn-leading`) |
| Pills: tinted bg + coloured text, 12 px medium, 4 x 10 px | `StatusPill.tsx:19` |
| Tray rows 56 px, 12 px radius, hover / selected brand-50, status dot, right mini progress | `Tray.tsx:73-79`, `:106` |
| Icons lucide 1.75 stroke, 18-20 px | `IconTile.tsx:33`, `button.tsx:7` |
| Tracker stepper filled / ring / hollow, connecting line, time below | `VisitTracker.tsx:44-95` (states at `:73-75`) |
| Inspector header with type icon tile | `InspectorFrame.tsx:49-51`; icon per type `InspectorBodies.tsx:40` |
| 150-200 ms ease-out hover / press / open | `src/index.css:284` (`soft-transition`), `button.tsx:7` |
| Panels slide + fade 200 ms | `Inspector.tsx:59`, `CollapsiblePanel.tsx:52` |
| Numbers tween 300 ms | `Num.tsx:4`, `:57` |

### §4 No flicker
| Rule | Evidence |
|---|---|
| Stable keys (ids) | `Tray.tsx:190` (bay), `:283` (visit), `:349` (event); tracker steps keyed by position `VisitTracker.tsx:55` |
| Memoised rows + selector equality | `Tray.tsx:113`, `:206`, `:303`, `:364`: rows take primitives only, so default shallow equality skips unchanged rows; selection selectors return a primitive (`Tray.tsx:185`) |
| No component swaps on value change | one rotated arrow (`KpiChips.tsx:50`); one icon per step position (`VisitTracker.tsx:21`); progress fill always mounted (`ThinProgress.tsx:26`); stepper always mounted, empty state = all pending (`VisitTracker.tsx:48`); bay inspector rows always mounted (`InspectorBodies.tsx:172`) |
| Fixed min-widths | `Num.tsx:69`; tray right column fixed (`Tray.tsx:73`); dwell `VisitTracker.tsx:167` |
| Stable order | bays by id; trucks at a bay then queued by arrival (`model.ts activeVisits`, unchanged); alerts newest first. Nothing re-sorts, so the 5 s re-sort rule holds trivially |
| FLIP on position changes | `useFlip.ts:8-33`, used by every tray list (`Tray.tsx:431`) |
| Skeletons only on first load, no Suspense flash | the overlay has no Suspense boundary; `MaybeValue` shows "—" only until the first value |
| Fewer commits | `useStreamNow` ignores the 1 Hz clock once stream time exists (`useLiveModel.ts:13-25`); `ModeBadge` renders once a minute instead of on every flush (`ModeBadge.tsx:12-23`); alert ages passed pre-formatted (`Tray.tsx:355`) |

## Profiler: method and numbers
A React DevTools-hook recorder (scratch script, not in the repo): a fake `__REACT_DEVTOOLS_GLOBAL_HOOK__` installed before page load walks
every react-dom commit, attributes each component to the overlay region it renders in (`kpi-chips`, `inspector`, `tray`,
`visit-tracker`, `top-bar`), and counts per component type the commits it took part in, instance renders, mounts and unmounts.
Dev server (readable names); Chromium headless with the GPU (SwiftShader starves the main thread: 0.67 commits/s, not representative);
1920x1080; peak day; **60x mock speed; a loading bay selected; 5 s settle, then 20 s measured**.

| Metric | Before (`815921f`) | After |
|---|---|---|
| Root commits | 85 in 20 s = **4.24/s** | 65 in 20 s = **3.24/s** |
| Busiest overlay component (commits/s) | 4.24 | **3.19** |
| Tray `Row` instance renders/s | 15.72 | **2.00** |
| Tray `StatusPill` renders/s | 15.72 | 2.00 |
| `ModeBadge` commits/s | 2.99 | **0.05** |
| Tracker `Header` commits/s | 2.99 | 1.95 |
| Inspector `KeyValue` instance renders/s | 50.86 | 33.09 |
| **Mounts / unmounts in steady state** | **+6 / -19** (tracker: step icon swaps `Check` +3/-5 and +3/-6; `Stepper`, `StatusPill`, `Truck`, `SmallCaps` -1 each when the bay's truck left; inspector: `KeyValue`, `StatusPill`, `ProgressRow`, `ThinProgress` -1 each) | **0 / 0** |

The after run was taken before the final px-only class edits (dimensions and padding), which do not change what renders.
Remaining commit sources, all ≤ 4/s: the 4 Hz store flush, and the 1 Hz clock before stream time exists. `GlobalSearch` re-renders at
2.2/s because it subscribes to bays even with an empty query (invisible; left as is).

## Automated flicker tests
- `src/features/live/LiveOverlay.flicker.test.tsx` (Vitest, jsdom): renders `LivePage` with a bay selected and ticks a fake store at 10 Hz
  for 5 s of stream time (50 updates of SiteState + 7 BayStates, every number changing), with the tray on Bays and on Trucks. Asserts:
  no element removed from the overlay (MutationObserver), every row / chip / tracker step / inspector row / number node is still the same
  node, layout-bearing classes and styles unchanged, and every tweened number reserves at least as many `ch` as the widest value it
  showed. Mutation check: keying bay rows by timestamp makes it fail. **Passes.**
- `e2e/live-flicker.spec.ts` (real layout): 60x mock speed; samples the boxes of chips, tray rows, cards and tracker steps every 100 ms
  for 5 s in EN and BN, and records any row / chip / step leaving the DOM. **Passes** (no size change, no unmount).

## Commands and results
| Command | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm lint` | pass |
| `pnpm format:check` | pass |
| `pnpm i18n:check` | ok |
| `pnpm contract:check` | ok (7 json blocks, 0 unmapped) |
| `pnpm test` | 761 / 763 pass. The 2 failures are `src/app/App.test.tsx` 5 s timeouts (7.4-8.1 s). The **baseline `815921f` fails identically** (7.9 s and 8.1 s, run from a `git archive` export with the same `node_modules`). Earlier today the full suite passed 763 / 763 with my changes in place, so this is time-of-day dependent (the simulator regenerates history up to wall-clock "now") |
| `E2E_PORT=4175 pnpm e2e` | 19 / 24 pass, including `live-visual` (both sizes, with the layout contract), `live-flicker`, `live-shell` (5 of 6), `mock-*`, `smoke`, `network-guard`, `debug-readout`. Failures: `live-scene` x4 (3D canvas never reports ready within 60 s, or a screenshot times out at 90 s on SwiftShader) and `live-shell` "event inspector" (the simulator restart to the peak day took over 60 s: the same time-of-day growth). In the first full run the same day, 3 of the 4 live-scene tests passed with my card styling already in place |
| Blur cost on SwiftShader (scratch measurement) | /live with the scene: 5.9 fps with the 12 px backdrop blur, 7.4 fps without (about 20 %); screenshot time unchanged. A real cost on CPU rendering, but not enough on its own to explain 60-90 s timeouts |

Screens written by older specs (`step-01` to `step-merge-02`) were backed up before e2e and restored afterwards: only `vis-ui-*` files
are new in `docs/screens`.

## Screens
`docs/screens/vis-ui-before.png`; `vis-ui-after-{1920x1080,1366x768}-{en,bn}-{light,dark}.png` (8); `vis-ui-compare.png` (ours 1920x1080
EN light next to `docs/reference/video/ui-ref-t09.jpg`, both 720 px high).

## Remaining visual differences vs the reference (honest)
- **The scene behind the cards** is the old grey/blue interior in this worktree (the 3D session owns it), so the overall frame is
  darker and busier than the reference. Judged on the cards alone, structure and styling match: tile + label + value + delta chips,
  inspector header, tinted pills, segmented tray tabs, stepper with subject card.
- **Density**: our cards carry more rows than the reference (the bay inspector has about 20 key/values against about 6), so they read
  denser. The inspector scrolls with no fade hint (backlog P2).
- **Bangla semibold renders at 700**: `main.tsx` loads Noto Sans Bengali 400/500/700 only, so 600 falls back to 700. Bangla titles look
  heavier than the Latin ones. See requests.
- **Progress bars are rare** because the simulator sends `expected = null` (unknown, never guessed), so tray rows show rates or counts
  where the reference shows mini bars.
- **Brand logo** is still the placeholder.
- **1366 px**: four KPI chips (turnaround and compliance hidden); the cases-chip delta sits right at the chip edge in Bangla.
- **The KPI chip is 86 px tall** (the reference scales to about 92 px at 1920) to stay inside the 112 px safe area.
- Pill text uses docs/06 colours exactly (e.g. `#E8890C` on `#FFF1DF`), which is below WCAG AA contrast at 12 px.

## Decisions and deviations
1. docs/06 wins over CLAUDE.md for colours (CLAUDE.md says so): brand is now `#2C6FED` (was `#1F36C7`), and ok / warn / critical use the
   docs/06 values. `--status-*` are aliases of these, so the 3D scene's status colours change too.
2. `--status-info` = `--brand-500` (docs/06: brand-500 for active states and selection; brand-50 for info pills).
3. Legacy scene token names (`--scene-floor-grid`, `--scene-wall-cap`, `--scene-conveyor`, `--scene-belt`, `--scene-ground/yard/road`)
   are kept as aliases so the current `scene/materials.ts` keeps working. The scene in this worktree now shows the docs/06 palette.
4. No user-selectable sorting exists, so lists keep a stable order and FLIP animates membership changes; no 5 s batching was added.
5. `SmallCaps` was removed in favour of `Caption` (its only other user, `GlobalSearch`, is in my scope).
6. New i18n key `live:kpi.tatSub` (en "today", bn "আজকের গড়"). `common.json` unchanged.
7. Test updates: `VisitTracker.test.tsx` checks the subject card's text instead of a direct text node (markup moved).

## Requests to main session
1. **`src/main.tsx`**: import `@fontsource/noto-sans-bengali/bengali-600.css` (Bangla semibold falls back to 700), and drop
   `@fontsource/inter/latin-700.css` (no 700 weight is used in /live any more; check the other routes first).
2. **`src/app/App.test.tsx`**: the two simulator tests time out depending on the time of day (baseline fails too). Pin the clock or
   raise their timeout.
3. **e2e on SwiftShader**: `live-scene` is at the edge of its 60 / 90 s budgets on this machine while another worktree runs. Consider
   `pnpm e2e:fast` (backlog P2), longer timeouts for scene specs, and disabling the card backdrop blur on the Low quality tier
   (about 20 % of CPU-rendered frame time).
4. **3D session**: read the docs/06 names (`--scene-floor-line`, `--scene-wall-accent`, `--carton`, `--pallet-*`, `--metal`, `--belt`).
   The legacy aliases can be deleted once `materials.ts` stops using them. Keep the subject inside the safe area: the 2D chrome now
   honours it exactly (e2e-asserted).
5. **docs/04 / CLAUDE.md**: update the status-token values and brand placeholder to the docs/06 values, so the docs agree.
6. Backlog P0 UI items ("UI cards low quality", "UI components flicker", "UI should feel smooth" for the 2D part) can be ticked after
   visual sign-off.
