# Task 22 spec: alerts and evidence centre, shift and daily reports, scene interaction (BINDING for all T22 sessions)

Baseline: master at `e7b7ce4` (merge of t20-10-w4, after task-21) or later. Contract revision 1.3 is additive (one optional field, section 2).
If a brief and this file disagree, stop and report.

Decision of 2026-11-06 (owner): this version ships WITHOUT any AI or language-model feature. Unilever uses it first; the AI discussion
resumes after several months of accumulated data. Everything below is deterministic. (Parked idea: "Depot Brief", BACKLOG P3.)

## 0. Standing rules that apply here
- Metric admission rule (CLAUDE.md): every figure in prime space answers a management question and supports a decision. This task adds NO new
  metric definitions: reports and lists reuse the definitions already in docs/03 (rev 1.1 turnaround, rev 1.2 where relevant) and the KPI popover groups.
- Privacy (docs/03 section 2, docs/01 section 4.1 item 3): no worker-level behaviour (phone, idle). Do not call `/analytics/people`. Person labels
  in the scene and reports show a role only; captain names only where `canSeeCaptainNames(role)` allows (src/lib/rbac.ts).
- Bays are always listed in bay order (B01 to B07), never sorted by a value. No ranking of people in reports or events.
- Computed in the backend, rendered by the frontend. No hard-coded sample numbers. Unknown = "-" with a reason; not measurable = hidden.
- Mock-first, single data boundary (UI never calls fetch directly), zod at the boundary, EN + BN with Bangla digits and lakh grouping, Asia/Dhaka.
- Offline: fonts bundled, no CDN. No new dependencies in this task (there is no virtualisation library and no XLSX library; both are hand-built or deferred below).
- Performance rules (docs/02 section 6): no React state per frame, store updates at most 4 Hz, instancing for repeated meshes.

## 1. Surfaces and the management question behind each
| Surface | Management question | Decision it supports |
|---|---|---|
| Live toast (warn and critical) | Did something new happen that needs a person now? | Who goes to which bay now |
| `/events` list | What is unresolved, and what happened to what we handled? | Who acts, what to escalate or close |
| Event drawer (snapshot, clip, history) | Is this real, and what is the evidence? | Confirm and act, or dismiss with a note |
| `/reports` shift report | What happened this shift and what must the next shift pick up? | Handover, staffing, follow-ups |
| `/reports` daily report | How did the day go and what goes to HQ? | Escalation, reporting |
| Scene click on truck, person, forklift, camera | Show me that object's details | Navigation only (no metric) |
Not shipped: assigning an event to a person (no contract field), XLSX export (needs a library or the backend export; open decision), anything per worker.

## 2. Task 22.0 base (shared code; single session on master; everyone else imports it and must not edit it)
Contract revision 1.3 (docs/03 first, then zod, fixtures, mock, MSW; changelog entry):
- `ReportBayRow.avgOccupancyMin: number | null`, optional in the zod schema (absent from older backends). Definition: mean over the bay's departed visits in
  the window of (departedAt - dockedAt) in minutes (bay occupancy, the T19 headline). `avgTatMin` stays (depot turnaround).
Data layer (`src/data/api/endpoints.ts`, `queries.ts`; zod-validated like bay-performance):
- `getEvents(params)` as an infinite query over `GET /events` (cursor, limit 100), `getEvent(id)`, `ackEvent`, `closeEvent(id, note)`, `noteEvent(id, text)`,
  `getVisit(id)`, `getReport(kind, {date, shift})`, `getMediaUrl(key)` (presign; cache until 30 s before `expiresAt`).
- Hooks: `useEventsInfinite(filters)`, `useEvent(id)`, `useEventAction()` (mutations with an optimistic update into the alertStore through
  `applyLifecycleTo`, rollback on error, 403 mapped to a "not permitted" error), `useReport(kind, period)`, `useMediaUrl(key)`.
- Query keys exported (`eventKeys`, `reportKeys`). Live alertStore changes (lifecycle messages) invalidate nothing: lists merge live open events by id (dedupe).
RBAC (`src/lib/rbac.ts`): `canAccessEvents(role)` (all except KIOSK), `canAccessReports(role)` (HQ_VIEWER, DC_MANAGER, SHIFT_SUPERVISOR, ADMIN),
`canExportReports(role)` (HQ_VIEWER, DC_MANAGER, ADMIN), `canActOnCategory` already exists. Route guard: `src/app/RouteGuard.tsx` plus a "Not available for your role" page.
Routes (`src/app/routes.tsx`): `/events`, `/events/:id` and `/reports` become lazy routes into stub pages exported from `src/features/events/index.ts` and
`src/features/reports/index.ts` (22A and 22C replace the stub bodies). Neither chunk may enter the /live entry (report chunk sizes before and after).
Shared UI and helpers:
- `EvidenceImage` (presigned snapshot with bbox overlay in percent, skeleton, error and no-media states), placed in `src/features/events/EvidenceImage.tsx`.
- `src/features/events/urlState.ts`: typed event filters, `parseEventFilters(searchParams)`, `serializeEventFilters(filters)`, `eventPath(id)`, `eventsPath(filters)`, with tests.
  Filters: `status` (OPEN, ACK, CLOSED, any combination; default OPEN+ACK), `sev[]`, `category[]` (visible to the role only), `bay[]`, `q`, `from`, `to`, `group` (one of ALERT_GROUPS ids), `groupBy=visit`.
- Print foundation: `print:hidden` on the shell chrome (top bar, tray, tracker, map controls), `@page A4` margins and `print-color-adjust: exact` in `src/index.css`.
- i18n: namespaces `events` and `reports` are LAZY: their JSON loads with the route chunk and is registered there (so strings added by 22A and 22C never enter the /live entry); `i18n:check` still checks them. The `scene` namespace already exists.
- Docs: BACKLOG P3 line "Depot Brief (AI) parked", PROGRESS skeleton, this spec's ownership table copied into `docs/progress/t22-0.md`.
Branding (owner decision 2026-11-06; implemented in 22.0 so every later page uses the same components):
- Product name: **DepotFlow** (the same in EN and BN, never translated). The client is Unilever Bangladesh; the product is built by TDI.
- Client logo: the supplied official file (`unilever-4.svg`, repo root) becomes `public/brand/unilever-logo.svg`. It is used UNMODIFIED: no recolouring, cropping, stretching, shadow or opacity.
  It is a single dark blue (#0F0E9A) lockup, so in the dark theme it sits on a light rounded tile. Minimum height 32 px; clear space of at least a quarter of its height.
- Assets (supplied 2026-11-06): the Unilever logo (`unilever-4.svg`); the DepotFlow artwork (`DepoFlow.svg`, a raster image auto-traced to vectors, with a grey background and garbled tagline text, so it is NOT used as supplied);
  the architect cut two clean crops from it, now in `public/brand/`: `depotflow-lockup.svg` (mark + wordmark) and `depotflow-mark.svg` (mark only). They have a transparent-to-white look and are INTERIM: use them on white only
  (a white tile in the dark theme), and replace them when a clean vector exists. The TDI logo (`the_data_island_tdi_logo.ico`, 32x32) becomes `public/brand/favicon.ico`; `public/brand/tdi-mark.png` (the same image as PNG) is the small mark in the credit.
  The three originals move to `assets-src/brand/` unchanged and are never served.
- Credit text: "Developed by TDI Pvt. Limited" (`{{company}}` comes from one constant in `src/brand.ts`: product, developer, client; legal-name wording is changed in that one place).
- Components in `src/components/common/Brand.tsx`: `ClientLogo`, `ProductName`, `DevelopedBy`, `AboutDialog` (opened from the user menu: product, version, client, developer, acknowledgements).
- Placements: top bar (logo + product name), page footers, About dialog, browser tab title and favicon, report header and printed footer (22C), later the login page and the wall.
Acceptance: typecheck, lint, test, i18n:check, build pass; no visible change except the stubs; bundle report; contract tests for the new field.

## 3. Task 22A: alerts and evidence centre
Live notifications (extend the shell; sonner already mounted):
- A toast fires only for an event that arrives live AFTER the connect backfill, sev warn or critical, visible to the session role, status OPEN.
  At most one toast per (category, type, bay) per 60 s. Hygiene and belt events of the same visit within 5 minutes collapse into ONE toast whose text and count update
  ("3 product issues, B04"). At most 3 toasts at once. Warn lasts 8 s; critical stays until dismissed. Toast actions: "Show on map" (select the event and fly to its bay) and "Open".
- Bell footer link "View all events" -> `/events` (default filters). Tray Alerts rows get "Open in Events". The KPI popover's "Needs attention" group rows link to
  `/events?group=<id>`; the page count for a group equals the popover count (same `matchesAlertGroup`). `EventBody` in the inspector gets Acknowledge, Close and Note
  (permission-gated) and "Open in Events".
`/events` page:
- Default view: status OPEN+ACK, any time, newest first. When CLOSED is included and no range is set, default range is today. Filter bar: the 8 "Needs attention" groups with
  counts, status control, severity, category (role-visible only), bay (B01..B07 in order), range (shift, day, week, custom), free text over title, plate and SKU. All state in the URL.
- Table (semantic grid, fixed 48 px rows, hand-written windowing, no dependency): severity, time (relative; absolute in tooltip), bay, title (bilingual), category, status, reference (plate or SKU), age.
  Keyboard: up and down move, Enter opens the drawer, A acknowledges (if allowed), Esc closes. Cursor paging at the end of the list. Live open events merge by id.
  New live rows never shift the view when the user has scrolled: a "N new" pill applies them. Optional "Group by truck" toggle (hygiene volume is about 250 events a day); default off.
- Drawer (right sheet, full width under 1024 px): severity and status, title, time, bay, camera and model confidence; snapshot with bbox and a full-size dialog; clip in a native
  `<video controls preload="none">` with the snapshot as poster; references (plate, SKU, visit) with "Show on map" (go to /live, select the truck or bay, fly to it);
  type-specific details from the event catalogue (docs/03 section 3.5); history (raised, acknowledged by and when, closed by and when with note, notes). Actions: Acknowledge (one click),
  Close (note required, at least 3 characters), Add note. Optimistic with rollback and an error toast. A lifecycle message arriving while the user types keeps the draft.
- Deep link `/events/:id` opens the page with the drawer on that event (fetch by id if not in the list). Unknown id, or a category the role cannot view: one neutral "Event not found or not available" state.
- Read-only roles (V) see no action buttons and a one-line explanation.
- States for list and drawer: loading skeleton, error with retry, empty ("No events match", with "Clear filters"), and the distinct good state "No open alerts" for the unfiltered default.
- Simulated-data marker in mock mode, same component as analytics.
Out of scope: assigning events, Telegram, rules admin, replay.

## 4. Task 22B: scene interaction (the rest of step 8)
Items, in priority order (B7 is dropped if it threatens the budget; report it):
- B1 Picking. Trucks, people and forklifts become selectable (`uiStore.select({kind:'truck'|'person'|'forklift', id})`, ids as the existing Inspector bodies expect).
  No R3F pointer handlers on instanced actors. One canvas-level handler: on click, a ray test against the rig's current actor bounds (spheres or capsules); hover only while the pointer
  moves, throttled to 10 Hz and skipped during camera drags; a pointer move over 4 px between down and up is a drag, not a click. The nearest hit wins; an actor beats the bay floor plate;
  bays, belts and staging stay selectable as today. Hover: pointer cursor and a light outline.
- B2 Selection marker and pill label for the selected actor (docs/04 section 1): truck "B04 - DHAKA METRO-DA 11-2171 - Loading 412"; person "Captain" or "Worker" (role only, no names, no ids);
  forklift "Forklift - B04". Marker follows the actor without React state.
- B3 Boom extend and retract (docs/04 section 3): tip y from the retracted position to `-boomMaxReach` scaled to the truck's cargo depth, eased over about 1.2 s; extended while a truck is docked through loading and finish,
  retracted while reversing, departing or with no truck. Per-bay animator state in `useFrame`.
- B4 Belt surface scroll proportional to `rateCpm` (zero when stopped, empty bay, offline); the scroll speed equals the item travel speed of `beltItems.ts` for the same rate (a unit test compares the constants).
- B5 Door shutters bound to truck presence (open when a truck is docked or within reversing distance, closed otherwise; about 0.8 s).
- B6 Camera glyphs at the config camera mounts (3 per bay): visible in X-ray mode, and always when the camera is not OK (state from `HealthFrame.cams`). Tints: obstructed, defocus, moved = warn; offline = critical with a slow pulse
  (off under `prefers-reduced-motion`). Click selects the newest open event for that camera (`kind: 'event'`), else nothing.
- B7 Person separation: crew figures keep a minimum centre distance of 0.55 m, displaced at most 0.6 m from the reported position, visual only, spatial hash per bay, at most 0.2 ms per frame at 40 actors.
Constraints:
- No new assets, no lighting, palette, camera preset, quality tier or apron layout changes. Every new GPU resource (materials, sprites, textures) is released through `gpuRelease` / `useReleaseOnUnmount`.
- Performance gate (22B.2, RTX 3050 Med, 1920x1080, peak, 60x, method of Task 16: interleaved, at least 6 runs each, foreground IDE): mean fps within 1.0 of the baseline commit and p95 frame time not worse by more than 1 ms.
  Intel UHD Med numbers are reported, not gated (open decision in BACKLOG). The default-mode `e2e/t21-nav-leak.spec.ts` must still pass.
- Phases: 22B.1 (parallel with 22A and 22C): code and unit tests, NO browser. 22B.2 (alone, after the other sessions have ended): Playwright click-to-inspector for each actor kind, hover cost,
  screenshots at 1920x1080 and 1366x768 in EN and BN, light and dark, the fps A/B, the nav-leak spec.

## 5. Task 22C: shift and daily reports
`/reports` (HQ_VIEWER, DC_MANAGER, SHIFT_SUPERVISOR, ADMIN). Controls: Shift or Daily; period chips (Current shift, Previous shift, date and shift picker; Today, Yesterday, date picker);
Print / Save as PDF; CSV menu with "Bays" and "Truck log" (client-side, UTF-8 with BOM so Excel shows Bangla; only for `canExportReports`). No XLSX button in this task.
The report is one A4-portrait document on screen and in print, in this order:
1. Header: `ClientLogo`, `ProductName`, depot name, "Shift report, Shift B, Thu 6 Nov 2026, 14:00 to 22:00", status "In progress" or "Complete", generated time, the simulated-data marker in mock mode.
2. Headlines (same definitions and labels as the KPI chips and popovers, no new metric): cartons out and in, trucks completed, bay occupancy (average; headline), depot turnaround (average; secondary),
   PPE compliance, alerts raised and still open at the end. Deltas against the previous period of the same length only for COMPLETED periods (second request); an in-progress period shows "figures so far" and no deltas.
3. "Handover: still open": counts per "Needs attention" group (same ALERT_GROUPS as the KPI popover) and the five most severe open or acknowledged events with bay, age and short id (screen: link to `/events/:id`).
4. Bays table in bay order, never sorted, with a totals row: cartons out and in, trucks, average occupancy (`avgOccupancyMin`, "-" if absent), belt running-loaded share of the time a truck was docked
   (running-loaded / (running-loaded + running-empty + stopped)), detentions, product issues (damaged + open tape + torn sack + wet + fall-off), PPE violations.
5. Truck log: finished visits in time order: plate (Bangla primary, English secondary), agency, bay, direction, arrival, wait for dock, bay occupancy, cartons, detention flag. Header repeats on each printed page.
6. Evidence: up to five events from `topEvents` with thumbnail and bbox, title, bay, status. The print button waits until thumbnails have loaded or failed.
7. SKU summary: top eight by count and the unknown share (data confidence).
8. Captains by bay assignment: only when `canSeeCaptainNames(role)`; no ranking; hidden for other roles.
Print: `DevelopedBy` and the generated time as a footer repeated on every printed page (fixed-position footer), A4 portrait, 12 mm margins, `break-inside: avoid` on sections and rows, colour never the only carrier of meaning (pills carry text), Noto Sans Bengali bundled and verified.
Data: in-progress period refetched every 60 s; completed periods fetched once.
Acceptance: a full mock shift prints to at most 3 A4 pages in EN and in BN, page 1 holds header, headlines and handover; no tofu or clipped Bangla (verified on the print-media screenshot and on a `page.pdf()` page count).

## 6. Ownership for the parallel phase
| Session | Worktree / branch | May edit | Must not edit |
|---|---|---|---|
| 22.0 base | main worktree / master | everything in section 2 | feature bodies |
| 22A events | `Unilever_Depo-worktrees/t22a`, `t22a-events` | `src/features/events/**` (except `urlState.ts`, `EvidenceImage.tsx`), `src/app/shell/AlertBell.tsx`, `src/features/live/{Tray,InspectorBodies,Inspector}.tsx` and `src/features/live/kpiDetail/details.tsx` (links and actions only), notification code under `src/app/shell/**`, `events.json` en/bn, `e2e/t22a-events.spec.ts`, `docs/progress/t22a.md` | scene, reports, shared files |
| 22B.1 scene | `Unilever_Depo-worktrees/t22b`, `t22b-scene` | `src/scene/**`, `src/app/LiveScene.tsx`, `scene.json` en/bn, `e2e/t22b-scene.spec.ts`, `docs/04-scene-spec.md`, `docs/progress/t22b.md` | `src/features/**`, shared files |
| 22C reports | `Unilever_Depo-worktrees/t22c`, `t22c-reports` | `src/features/reports/**` (except the stub export line), `reports.json` en/bn, `e2e/t22c-reports.spec.ts`, `docs/progress/t22c.md` | scene, events, shared files |
| 22.9 integration | main worktree / master | merges (order: C, A, B), seam fixes, screenshots, docs; then 22B.2 verification alone | new features |
Shared files nobody edits in the parallel phase: `src/brand.ts`, `src/components/common/Brand.tsx`, `index.html`, `public/brand/**`, `src/domain/**`, `src/data/**`, `src/stores/**`, `src/lib/**`, `src/i18n/index.ts`, `src/i18n/locales/*/{common,live,analytics,events,reports}.json` (events and reports are owned by 22A and 22C
for their own keys once 22.0 has registered them; `common` and `live` stay shared), `src/app/routes.tsx`, `src/app/RouteGuard.tsx`, `src/index.css`, `docs/03`, `docs/PROGRESS.md`, `package.json`, the lockfile, `playwright.config.ts`, `e2e/fixtures.ts`.
The parallel phase runs NO browser, NO Playwright, NO screenshots: allowed are typecheck, lint, format:check, i18n:check, `pnpm test <path>` (`--testTimeout=60000` if needed), build.

## 7. Definition of done for Task 22
Typecheck, lint, test, i18n:check, build pass; the nav-leak spec passes in default mode; e2e specs of 22A, 22B and 22C pass alone; screenshots at 1920x1080 and 1366x768 in EN and BN reviewed by the owner;
the fps gate of section 4 holds; docs/PROGRESS.md, docs/04, docs/06 (if surfaces change) and BACKLOG updated; contract rev 1.3 listed for the backend developer.

## 8. Global prohibitions
No AI or language-model features. No new dependencies. No `/analytics/people`. No per-worker data. No hard-coded numbers. No assets, lighting or palette changes. No pushes, no destructive git operations,
no full e2e suite. A parallel session that finds a gap in a shared file stops and reports it; it does not edit the file.
