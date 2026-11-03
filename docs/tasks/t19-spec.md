# Task 19 spec: executive KPI cards + bay operational panel (BINDING for all T19 sessions)

Baseline: commit `1a2c653` (task-18). Contract revision 1.1 is additive; payloads keep `v: 1`.
This file is read by the base session (19.0), the two parallel sessions (19A, 19B) and the integration session (19.9).
If a brief and this file disagree, stop and report.

## 0. Metric admission rule (standing rule; also copied into CLAUDE.md by 19.0)
Every metric in prime dashboard space (KPI chips, KPI popovers, the top sections of the bay inspector) must answer a
management question and support a management decision. A metric without a row in section 3 does not ship in prime space.
It may live in a collapsed "More details" block or in `/analytics`, never beside the headline numbers.
A value that cannot be measured at this depot is hidden, not shown as a permanent "-" (a "-" is for a value that is
temporarily unknown, with a tooltip saying why).

## 1. Definitions (visit timestamps from docs/03)
- Depot turnaround      = departedAt - arrivedAt    (equals the existing `avgTatMin`)
- Wait before docking   = dockedAt - arrivedAt      (NOT "wait before bay assignment": dhk-depot has no gate camera,
                                                     so `arrivedAt` is the first DOCK-camera read)
- Bay occupancy         = departedAt - dockedAt
- Pre-operation delay   = startedAt - dockedAt      (docked, no carton moved yet)
- Loading/unloading     = finishedAt - startedAt    (label follows belt direction: OUT loading, IN unloading)
- Post-operation delay  = departedAt - finishedAt
- Identity: occupancy = pre-operation + loading/unloading + post-operation.
- Averages are over visits FINISHED in the current business day, minutes, nullable.
- PPE compliance = % of evaluated person-observations with all mandatory PPE present. It excludes on_belt, crowding
  and forklift_proximity (those are safety events, counted under "Safety" in the alert groups).
- "Cartons" is the UI word for the counted unit (EN "cartons", BN "কার্টন"). Field names keep `cases*`. One i18n key
  per place so the word can be reverted.

## 2. Contract revision 1.1 (docs/03 first, then zod in src/domain/schemas.ts, then the simulator)
Additive, nullable or optional. The frontend must parse payloads WITHOUT the new fields (older backend).
1. `SiteState.kpi.turnaround`: `{ n, occupancyMin, depotTatMin, waitForDockMin, preOpDelayMin, activeMin, postOpDelayMin }`,
   minutes, each nullable (all null when n = 0). `depotTatMin` must equal `kpi.avgTatMin`.
2. `Visit.dwell`: first read how docs/03 and the simulator define `waitToStartMin`. If it already means
   dockedAt->startedAt, reuse it as pre-operation delay and add only `occupancyMin` and `waitForDockMin`. Otherwise also add
   `preOpMin`. Report which case applied.
3. `BayState.visit.skuCount`: integer or null (distinct SKUs seen on this visit; `skuTop` stays the top list).
4. `kpi.complianceScore`: update the definition text to PPE-only (section 1).
5. Every JSON example in docs/03 stays a valid fixture (`pnpm contract:check`).
6. No new event types. Changelog entry "proposal to backend, not implemented": `belt.low_throughput` (warn) for an
   abnormal drop in cartons/min.
7. Add a "Changelog" section at the end of docs/03 for rev 1.1.
8. The mock simulator produces items 1 and 3 from its own visits (unit test with a visit that has null timestamps and with an
   empty day). Real-backend note: wh-api/state-engine must add the same fields; the final report lists the exact diff.

## 3. Metric admission table (the management question behind each number)
| Metric | Management question | Decision it supports | Source |
|---|---|---|---|
| Cartons today (out / in, delta vs same time yesterday) | Are we on pace compared with a normal day? | Hold or add labour and trucks for the rest of the shift | kpi.casesOut/In, deltas |
| Rate now, out/hour and in/hour | Is the depot moving fast enough to finish today's dispatch? | Reinforce a bay or re-sequence trucks | sum of bay belt.rateCpm x 60 by belt.direction |
| Bay occupancy (headline of the turnaround chip) | How long does a truck tie up a dock door? | Dock capacity and appointment scheduling | kpi.turnaround.occupancyMin |
| Pre-operation delay | Why do trucks sit docked before loading starts? | Fix preparation: pallets staged, captain and crew assigned, paperwork | kpi.turnaround.preOpDelayMin |
| Loading/unloading duration | Is the physical work itself slow? | Crew size, equipment, bay layout | kpi.turnaround.activeMin |
| Post-operation delay | Why do finished trucks stay? | Release paperwork, transporter behaviour | kpi.turnaround.postOpDelayMin |
| Depot turnaround | What does the transporter experience? | Detention disputes, scheduling | kpi.turnaround.depotTatMin |
| Wait before docking (only when non-null) | Is the yard queue the bottleneck? | Dock allocation | kpi.turnaround.waitForDockMin |
| PPE compliance % | Is the crew following the safety policy? | Coach or enforce | kpi.complianceScore |
| Most violations today: bay | Where should a supervisor go? | Targeted coaching | BayState.today.ppe (max over bays) |
| Needs attention (open warn + critical) | What needs a manager's action now? | Act, delegate, escalate | kpi.openAlerts |
| Alert groups | What kind of problem is it? | Who to send | open alerts by group (section 5D) |
| Bay: truck timeline (pre-op / work / post-op, occupancy) | Is this truck where it should be? | Intervene on this bay now | visit timestamps |
| Bay: finish ETA | When does this door free up? | Next truck assignment | visit.etaMin |
| Bay: cartons this visit, cartons/min | Will this truck finish on time? | Reinforce the bay | visit.casesOut/In, belt.rateCpm |
| Bay: workers detected | Is the bay staffed? | Move people between bays | crew.workers |
| Bay: storekeeper detected Yes/No | Is anyone accountable at the bay? | Assign or call the captain | crew.captain.present |
| Bay: forklift operator detected Yes/No | Will pallets be moved? | Reassign an operator | crew.forkliftOps |
| Trucks on site (docked / waiting) | Is the yard congested? | Dock allocation, call trucks forward | kpi.trucksOnSite, trucksDocked, trucksWaiting |
| Bays running x/7 | Is all capacity in use? | Re-sequence trucks, open an idle bay | kpi.baysRunning, baysTotal |
| Bay: PPE violations now | Is someone unsafe right now? | Send a supervisor | crew.ppeViolationsNow |
| Bay: today cartons / trucks / avg TAT | How has this bay performed today? | Compare bays; feeds Task 20 | BayState.today.casesOut/In, trucks, avgTatMin |
| Bay: SKUs detected | (none by itself) | none | visit.skuCount: DEMOTED to "More details" |
Rows added by 19.9b (decision D4): Trucks on site, Bays running, Bay: PPE violations now, Bay: today cartons / trucks / avg TAT.
Existing rows of the bay inspector (belt, door, staging, today, cameras) keep their content but move into a collapsed "More details" block.

## 4. Shared pure code (owned by 19.0; 19A and 19B import it and must not edit it)
- `src/features/live/kpiDetail/selectors.ts`: `selectRates(bays)`, `selectTurnaround(kpi)`, `selectWorstPpeBay(bays)`,
  `selectAlertGroups(events)`, `ALERT_GROUPS` (one config table), `visitTimeline(visit, nowMs)` (segments + occupancy;
  in-progress segment flagged), all pure, all unit-tested.
- `src/features/live/useFmt.ts`: add `durHM(min)` formatter ("1h 05m", BN digits "১ ঘ ০৫ মি"), tested EN and BN.
- `src/stores/**`: if a hook is needed (for example `useNowSec()` at 1 Hz, using the existing `clock.ts`), 19.0 adds it.
- i18n: 19.0 registers two NEW namespaces in `src/i18n/index.ts` and i18n-check: `kpidetail` (owned by 19A) and
  `baypanel` (owned by 19B), each with empty-but-valid `en` and `bn` files. 19.0 also does the relabels in `live`
  ("cases" -> "cartons", "Compliance" -> "PPE compliance") so 19A and 19B never edit `live.json` or `common.json`.

## 5. UI specification
### 5A KPI chips (owner 19A; files `src/features/live/KpiChips.tsx` and new `src/features/live/kpiDetail/**`)
Chips stay compact; the top-left row must not grow or shift (docs/06 safe area, 1366x768 included). Each chip opens a detail
popover: click or Enter; Esc and outside click close; focus-trapped; floating-card style (docs/06 section 3); anchored under
the chip; lazy-loaded; no layout shift; tabular numbers; DOM only, no scene work.
Placement and size (19.9b, decision D1, replaces "never covers a bay at 1366x768"): popovers are compact (two- or three-column
cells where it helps, tight padding, no title that repeats the first row's label: a headline number sits on the title line).
They MAY transiently overlap bays, because they open on click and close on outside click or Esc. They must NEVER cover the chip
row, the inspector card or the tray, and must stay inside the viewport (the right-most chip's popover aligns to the chip's right
edge for this).
- Cartons: chip shows the total today and the delta (as now). Popover: Out today and In today with deltas; rate now
  out/hour and in/hour; "-" with tooltip when no belt is running.
- Turnaround chip: headline "Bay occupancy 1h 05m". Popover rows: Depot turnaround (+ existing delta), Pre-operation delay,
  Loading/unloading, Post-operation delay, Wait before docking (only when non-null), a proportional stacked bar
  pre-op/work/post-op, and "n visits". If `kpi.turnaround` is absent (older backend) the chip falls back to
  "Avg turnaround <avgTatMin>" with a truthful label.
- PPE compliance chip: percentage and "Most violations today: Bay N (count)". Nothing invented.
- Alerts chip: headline "Needs attention" = open warn + critical, beneath it "<critical> critical, <warn> warning, <info> info";
  critical uses the critical colour token; info never inflates the headline. Popover: alert groups sorted by critical then warn,
  each row clickable to open the existing Alerts tray filtered to that group. Totals come from `kpi.openAlerts`; groups come from
  the alertStore. Unknown types go to "Other", never dropped. The bell is NOT changed.
Alert groups (single config table):
1 Delays & waiting: truck.detention
2 Idle & stoppage: belt.empty_run, security.door_open_idle
3 Throughput & staging: staging.pallet_wait
4 PPE: ppe.violation
5 Safety: compliance.on_belt, compliance.crowding, compliance.forklift_proximity
6 Product hygiene: hygiene.*, belt.fall_off
7 Security: other security.*
8 System & roster: system.*, roster.*
Tray filtering: reuse `AlertFilter.categories` from `src/stores/alertFilter.ts`; if the tray has no way to apply it, add the
minimal filter state inside the tray files only (`Tray.tsx`), nothing in `src/stores/**`; if that is impossible, stop and report.

### 5B Bay inspector (owner 19B; `BayBody` in `src/features/live/InspectorBodies.tsx` plus new `src/features/live/bay/**`)
Order revised by 19.9b (decision D2; goal: the whole truck timeline visible without scrolling at 1366x768, EN and BN, with a
truck loading, inside `BayBody` and `src/features/live/bay/**` only). Keep the header and the belt-status pill. Body in this order:
0. Plate (Bangla primary, English secondary) and the phase pill, one compact line.
1. Truck timeline: stacked bar pre-op / loading|unloading / post-op with durations and total bay occupancy; in-progress
   segment marked "so far" and ticking from the shared 1 Hz clock (no per-component timers, no React state per frame);
   phase DOCKED shows pre-op counting up; finish ETA from `visit.etaMin` when present; no truck: empty state.
2. Throughput: cartons this visit (casesOut or casesIn by direction), cartons/min (belt.rateCpm), bay-today cartons, trucks, avg TAT.
3. Workforce: workers detected, storekeeper detected Yes/No, forklift operator detected Yes/No. Captain name only when the
   payload carries it (showCaptainNames rule).
3b. Bay status, one compact block: door, belt direction, captain line (name per the showCaptainNames rule), PPE violations now.
4. "More details" (collapsed by default, existing CollapsiblePanel): the existing belt, door, staging, today and cameras rows
   plus SKUs detected.
PRIVACY (binding): never idle or phone time, never per-person rankings or any person-level behaviour.

## 6. Ownership for the parallel phase
| Session | Worktree / branch | May edit | Must not edit |
|---|---|---|---|
| 19.0 base | main worktree / master | contract, schemas, simulator, `kpiDetail/selectors.ts`, `useFmt.ts`, `src/stores/**`, i18n index and namespaces, `live`/`common` relabels, this spec, CLAUDE.md rule | scene, UI components |
| 19A KPI | `Unilever_Depo-worktrees/t19a`, `t19a-kpi` | `KpiChips.tsx`, `KpiChips.test.tsx`, `src/features/live/kpiDetail/**` except `selectors.ts`, `Tray.tsx` (+ test), `kpidetail.json` en/bn, `e2e/t19a-kpi.spec.ts`, `docs/progress/t19a.md` | anything in the 19B column, shared files below |
| 19B bay | `Unilever_Depo-worktrees/t19b`, `t19b-bay` | `BayBody` in `InspectorBodies.tsx`, `Inspector.test.tsx`, `src/features/live/bay/**`, `baypanel.json` en/bn, `e2e/t19b-bay.spec.ts`, `docs/progress/t19b.md` | anything in the 19A column, shared files below |
| 19.9 integration | main worktree / master | merges, `docs/PROGRESS.md`, `docs/01`, `docs/06`, `docs/BACKLOG.md`, fixes at the seams | scene |
Shared files nobody in the parallel phase edits: `src/domain/**`, `src/data/**`, `src/stores/**`, `src/i18n/index.ts`,
`src/i18n/locales/*/{common,live}.json`, `playwright.config.ts`, `e2e/fixtures.ts`, `docs/03`, `docs/PROGRESS.md`, `package.json`, lockfile.
`InspectorBodies.tsx`: only 19B, and only inside `BayBody` (Site and Truck bodies untouched). If a change outside your column
is needed, report it; do not make it.
Parallel phase runs NO browser, NO Playwright and NO screenshots (two sessions would starve each other and Windows throttles the test
browser). Allowed: `pnpm typecheck`, `pnpm lint`, `pnpm test` (use `--testTimeout=60000` if load causes 5 s timeouts), `i18n:check`,
`format:check`, `build`. The e2e specs are written but only RUN in 19.9.

## 7. Global prohibitions
No scene, lighting, camera, quality, actor or asset changes. No chart library (Task 20). No hard-coded sample numbers; every
value comes from stores or selectors. No new event types. No NATS or REST changes beyond zod schemas. All strings EN + BN with Bangla digits and
lakh grouping. No pushes, no package installs (except where a brief says), no destructive git operations.
