# Step 5: App shell and /live 2D layout

Branch `step-05-shell` (worktree `E:/Dev/Unilever_Depo-worktrees/shell`), baseline `b274038`. Uncommitted, per the brief.
Fed by the existing stores (FixtureSource data). The interior 3D view mounts later in `<SceneSlot/>`.

## What was built
| Area | Files |
|---|---|
| Top bar (logo + product name, search, site switcher, LIVE/MOCK/REPLAY + Dhaka clock, connection dot, bell, EN/বাং, theme, user menu) | `src/app/shell/*`, `src/app/AppShell.tsx` |
| KPI chips (6, deltas, null -> "—" + tooltip) | `src/features/live/KpiChips.tsx` |
| Inspector (generic frame + site, bay/belt, staging, truck/visit, event, person, forklift bodies) | `Inspector*.tsx` |
| Tray (Bays n/7, Trucks n, Alerts n, Captains n; row click = select + `flyTo`) | `Tray.tsx`, `focusObject.ts` |
| Visit tracker (Arrived -> Docked -> Loading n/expected or "—" -> Finished -> Departed, Dhaka times, dwell clock) | `VisitTracker.tsx`, `model.ts` |
| `<SceneSlot/>` with a documented children contract | `SceneSlot.tsx` |
| Shared presentational pieces | `src/components/common/*` |
| Strings (EN + BN) | `src/i18n/locales/{en,bn}/live.json` |
| Tests | 5 unit test files in `src/features/live`, `src/app/shell/AlertBell.test.tsx`, `e2e/live-shell.spec.ts` |

## Decisions and deviations (with evidence)
1. **`/live` is rendered by `AppShell`, not by the route.** `src/app/routes.tsx` is read-only and maps `live` to a placeholder;
   `src/app/App.test.tsx` (also read-only) asserts `/live` resolves to `placeholder-title` and the EN/বাং toggle flips `sample-string`.
   `AppShell` therefore renders `<LivePage/>` when `pathname === '/live'` and keeps the route's `<Outlet/>` mounted inside `sr-only`.
   Evidence: `pnpm test` (App.test unchanged, passes) and `e2e/smoke.spec.ts` (passes unmodified).
   **Main session:** point the `live` route at `<LivePage/>`, delete the `isLive` branch in `AppShell`, update `App.test.tsx`.
2. **The top bar now shows on every route**, replacing the old header. The footer ("Developed by TDI" + TDI logo) is kept on non-live routes; on `/live` the credit is a small centred line at the bottom.
3. **`sample-string` test id** moved to the site switcher label (`app.sample` = "Dhaka Central Depot"), so the existing smoke test and App test keep working. It is a short label until the site list API supplies short names; the dropdown shows full names from config.
4. **Site info comes from `config/sites/dhk-depot.json`**, validated with `SiteConfigSchema` (`src/features/live/siteInfo.ts`): bay labels (bn/en), conveyor names, site name and pallet-wait threshold. No hard-coded bay names.
5. **Visit selection rules** (`resolveVisit`): a truck selection shows that visit; a bay/belt/staging selection shows that bay's visit or the empty state (never another bay's truck); with nothing/site/event/person selected the tracker defaults to the first loading visit (display only, selection is not changed).
6. **"Trucks n" in the tray** counts visits attached to a bay (`BayState.visit`). `kpi.trucksOnSite` (9 in the fixture) also counts trucks in the yard that have no bay, so the two differ by design until the simulator provides yard visits.
7. **"Dwell" and "ago"** use the newest message timestamp (`liveStore.lastTs`) as "now", so replay and mock read consistently. The e2e pins `Date` (`page.clock.setFixedTime`) so the fixture clock matches the 19:50 contract fixtures; without it the fixture's fixed `arrivedAt` (24 Oct) makes dwell look like a day.
8. **Captain names:** shown only when the message carries a name AND the role may see it (`privacy.ts`: not `KIOSK`, not `HQ_VIEWER` because `showCaptainNames` is off by default and not exposed yet). Otherwise "Captain". Employee IDs are never shown. Persons show role and PPE state only; no activity state is shown for people (so "stationary" cannot read as idle) and nothing on phone use or idle exists anywhere (unit test greps the inspector).
9. **KPI open-alerts chip** reads `SiteState.kpi.openAlerts` (site aggregate, not role-filtered); the bell, the tray Alerts tab and search use `useOpenAlerts()` (role-filtered). Counts can differ in fixture mode (7 vs 1): the fixture emits one event.
10. **Search** covers bays (id, label bn/en, conveyor), trucks (plate bn/en incl. Bangla digits, agency, visit id), captains (only when names allowed) and events (id, title, plate, category.type). SKUs are not searched: there is no SKU master in the stores yet.
11. Body text is 14 px (rem = 14 px); chip/pill secondary text is 0.85 rem (≈ 12 px) and small-caps labels 0.85 rem. `/wall` sizing is not part of this step.
12. `DropdownMenuRadioItem` (shadcn, read-only) places its indicator with `left-*`; it does not mirror in RTL. Not relevant for EN/BN (both LTR).

## Commands and results (all run in the worktree)
| Command | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm lint` | pass (0 warnings) |
| `pnpm format:check` | pass |
| `pnpm test` | 27 files, 640 tests pass (50 new) |
| `pnpm i18n:check` | ok |
| `pnpm contract:check` | ok (7 json blocks, 0 unmapped) |
| `pnpm build` | pass (run by the e2e web server; chunk-size warning is pre-existing) |
| `E2E_PORT=4175 npx playwright test` | 12 passed (6 new in `e2e/live-shell.spec.ts`; network guard active) |

The full e2e run rewrites `step-01-*` / `step-04-*` screenshots; those were restored from a backup, so only `step-05-*` files are new.

## Screenshots (`docs/screens/`)
`step-05-live-{1920x1080,1366x768}-{en,bn}.png` (bay B02 selected), `step-05-live-1920x1080-dark-truck.png`,
`step-05-live-1366x768-{bell,event,search}.png`. The e2e also asserts: no horizontal/vertical page overflow, cards inside the viewport,
inspector never overlapping the tray, the centre of the screen hits the scene slot, and panels collapse.

## Remaining visual gaps vs the reference frames
- The reference has three KPI chips; we have six (docs/01) with icon tiles at >= 1600 px only (at 1366 six chips with icons would wrap).
- The reference visit tracker has a right-hand "shipment" mini card with a thumbnail; ours has a status/transporter/ETA strip (no truck image until the 3D session provides one).
- No zoom / rotate / home controls column left of the inspector: those are the 3D session's controls (docs/01 "3D controls").
- Inspector at 1366x768 scrolls (Bangla and English alike) because the tray reserves ~40% of the column; there is no scroll fade hint.
- Tray rows have no per-row icon tile (reference has a small avatar/icon per forklift or truck).
- The scene area is a flat grid placeholder, so the soft-shadow depth of the white cards against a 3D scene cannot be judged yet.
- Event thumbnail is a placeholder box with the bbox outline drawn from `media.bbox`; presigned images come with the API step.

## Requests to main session
1. **Routes:** map `live` to `<LivePage/>` (exported from `@/features/live`); then remove the `isLive` branch and the hidden `<Outlet/>` in `AppShell`, and update `App.test.tsx` (`/live` no longer renders `placeholder-title`).
2. **Mount the scene:** `<LivePage scene={<SceneRoot/>}/>` or `<SceneSlot><SceneRoot/></SceneSlot>`. Contract is in the doc comment of `SceneSlot.tsx`.
3. **`src/lib/rbac.ts`:** `canSeeCaptainNames(role)` lives in `src/features/live/privacy.ts` as a local adapter; move it into the rbac matrix.
4. **Selector wishes (adapters exist, none blocking):** `useVisits()` / `useTruckVisits()` (the shell derives them from `bays[*].visit`); a `siteId` / selected-site store for the site switcher (single site hard-wired to the config file today); a per-visit `agency` and yard (waiting) trucks if the "Trucks n" tab should match `kpi.trucksOnSite`.
5. **Common strings:** none needed. `app.name`, `app.sample`, `app.developedBy`, `app.logoAlt` and `language.*` are reused from `common`.
6. **Scene hook-up of `uiStore.cameraTarget`:** the tray calls `flyTo(kind, id)` with `kind` = `bay | truck | event | person` and `id` = bay id / visit id / event ULID / track id. The scene must resolve `truck` (visit -> bay) and `person` (track id -> actors frame; ids repeat across bays in fixture data, first bay by id wins).
7. **Misc:** `ModeBadge` reads `import.meta.env.VITE_DATA_MODE` directly (as `DebugReadout` does); a `useDataMode()` hook would let tests set it.
