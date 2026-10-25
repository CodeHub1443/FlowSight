# Step 3: Mock simulator and MSW (parallel worktree `sim`)

Baseline: `b274038 step-04c: SiteConfig view block` (HEAD verified, tree clean at start). Branch `step-03-sim`. Nothing committed by this session. Only files in the step-3 ownership list were edited, plus generated screenshots in `docs/screens/step-03-*.png` (see deviation 9).

## What was built

```
src/data/mock/
  core/                 pure simulation, no React, no DOM, no timers (runs in Node)
    rng.ts              mulberry32 PRNG, forks, ULID from the seeded stream
    clock.ts            fast Asia/Dhaka helpers + ShiftClock (shifts and business day from config)
    catalog.ts          SKU master (14 SKUs incl. Rin/Wheel SACK), agencies, employees, plates, event titles/sources
    eventFactory.ts     builds every WhEvent and parses it with the domain schema (a bad shape throws in the simulator)
    bay.ts              one bay: visit lifecycle, belt segments, crew, forklift, staging, BayState/ActorsFrame/CaseTick
    depot.ts            seven bays + gate arrivals, dispatch, scripted incidents, aggregates, live publishing cadence
    history.ts          events, visits, belt intervals, hourly counts, SKU counts, camera incidents (feeds REST)
    api/                the REST router (docs/03 section 4) over the history: util, analytics, reports, admin, index
    controller.ts       command protocol (init, speed, pause, trigger, connect, rpc) + virtual-clock loop
    testing.ts          test helpers
  simulator.worker.ts   5-line Web Worker wrapper around SimController
  runtime.ts            SimRuntime (main-thread side), WorkerHost and InlineHost (same controller, no worker)
  MockSource.ts         DataSource: status, 7 on* channels, speed 1x/10x/60x, seed, pause, scenario, trigger, rates
  MockControls.tsx      dev panel (not mounted)
  index.ts              exports MockSource, MockControls, runtime helpers
src/data/msw/
  handlers.ts           createHandlers(): every endpoint of docs/03 section 4
  session.ts            mock login (manager, hq, supervisor, security, admin, kiosk; any non-empty password)
  people.ts             GET /analytics/people: the ONLY place worker idle/phone minutes exist
  placeholder.ts        OffscreenCanvas evidence JPEG (grey frame, bbox, label, timestamp)
  index.ts              startMockApi()
public/mockServiceWorker.js   from `pnpm exec msw init public --save=false`
src/i18n/locales/{en,bn}/mock.json
e2e/mock-browser.spec.ts + e2e/mock-harness/   real-browser check (own Vite dev server on E2E_PORT+1)
```

Data flow: `SimController` (worker) owns the `Depot`. It steps a **fixed 0.5 s virtual clock** (history uses 5 s steps), so output depends only on seed and start time, never on speed changes or how `advance` calls are batched. `MockSource` validates every message with `safeParseMessage` before a listener sees it (invalid: dropped and counted). REST goes `MSW handler -> SimRuntime.request -> worker -> handleApi(depot, req)`; the history lives only in the worker.

## Behaviour (docs/05 step 3)

| Requirement | How |
|---|---|
| Arrivals | Gate gap U(6,15) min while the previous arrival was 17:00-23:00; U(25,70) min 06:00-17:00; U(60,180) min at night |
| Holding lane | Each truck is assigned a bay at the gate (fewest trucks, random tie). It waits in that bay's queue, counted in `trucksWaiting`; the bay reverses it in 1-2 min after the previous truck leaves |
| Visit | reverse (1.5-4 min) -> docked -> start after tri(5,10,25) min -> load tri(250,420,900) items at tri(8,15,20) cpm with segments of stoppage / empty belt -> last item + `finishedGapMin` of empty belt -> finished -> post-load tri(3,5,12) min -> departed. ~80% OUT |
| Plates | `ঢাকা মেট্রো-{ট\|ড\|ন\|শ} {১১-৪০}-{4 Bangla digits}` with `DHAKA METRO-{TA\|DA\|NA\|SHA} nn-dddd` |
| SKUs | 14 mock SKUs, 3-5 per truck, 4% UNKNOWN (conf 0), RIN-PB-1KG and WHL-1KG are SACK |
| Crew | per active bay: 1 captain, 3-6 workers, 1 forklift operator; people walk between the config work zone and staging, the forklift shuttles aisle <-> staging; acts never PHONE/IDLE |
| Events | damaged 0.5%, open_tape 0.3%, wet 0.1% of items, torn_sack 0.4% of sacks; fall_off ~1 per bay-day; PPE ~3 per shift; detention / empty_run / pallet_wait from `thresholds`; compliance.on_belt and forklift_proximity rare critical; unknown_plate on plate conf < 0.7; one camera_offline + camera_ok and one pipeline_lag per day |
| Evidence | every camera event with evidence has `media.snapshotKey`, `clipKey` null (snapshot only) |

Measured over four seeds of 7 simulated days: ~50 visits/day, 78-81% OUT, average turnaround 70-75 min, average wait to dock 6-9 min (max 86-106), detention 14-19% of visits, ~25-27k items/day, ~250 hygiene events/day, 5-7 PPE violations/day.

## Performance (measured)

| Measure | Result |
|---|---|
| 7 simulated days of history, Node (`pnpm test`) | 0.9-1.5 s (up to ~5 s when the machine is loaded by parallel test workers) |
| 7 simulated days of history, in the Web Worker (Chromium, e2e) | 622-873 ms |
| 24 simulated hours live (0.5 s steps, all publishing on) | 609,631 messages in ~5.0 s of Node time (budget 20 s) |
| Live feed at 1x, evening peak | about 12 msgs/s total (actors ~10/s, bayState ~1/s for all 7 bays, siteState ~0.4/s, cases ~0.4/s at that moment, events ~0.02/s); cadences scale with speed so 60x stays near the same wall-clock rate except CaseTicks (every item is emitted so counts stay exact, ~100/s at 60x) |

## Tests (all green)

Total repo: **26 test files, 648 tests** (`pnpm test`). New in this step:

- `core/simulation.test.ts` (27): 10,000+ messages (all 7 kinds) validate with 0 failures; event subject <-> category/type and closed catalogue; contract refinements; determinism (same seed identical first 1,000 messages, different seed differs, chunking-independent, manual triggers do not change the day); shiftSec has 5 keys summing to elapsed shift time, also across the 22:00 shift boundary; BayState visit counters (and per-SKU counts) equal the CaseTicks emitted for the visit; SiteState equals the bay states published with it; no PHONE/IDLE and no phone/idle strings in any message or in the simulator source; actors inside the work zone/staging/aisle, no names; captain names null; crew sizes; visit order and ranges; ~80% OUT; arrival gaps; detention only past the threshold; plates; SKU mix; event rates; one camera_offline/camera_ok per day; thresholds are read live; 24 h run < 20 s.
- `core/clock.test.ts` (3): the fast clock equals `src/lib/time.ts` over 254 sampled instants.
- `msw/handlers.test.ts` (17): every endpoint through real `fetch` + `msw/node`, each response parsed with the domain schema; cursor pagination, every filter, ack/close/note with the EventLifecycleUpdate they emit, role gating, `people` only for DC_MANAGER/ADMIN, presign returns a `blob:` JPEG and refuses clips, admin PUT round trips.
- `MockSource.test.ts` (7), `MockControls.test.tsx` (4: EN and Bangla render, interactions, renders nothing for a non-mock source).
- `e2e/mock-browser.spec.ts` (3, Chromium): worker script loaded, MSW service worker answers REST, ack comes back on the lifecycle channel, the evidence JPEG decodes at 640 px, MockControls at 1920x1080 and 1366x768 in EN and Bangla with no overflow.

## Deviations and decisions

1. **Waiting trucks are only counts.** The contract has no per-truck message for the holding lane (`BayState.visit` is the truck at the door; `SiteState` has `trucksWaiting`). The scene (step 8) therefore cannot place individual waiting trucks from live data. Proposal for docs/03 if wanted: `BayState.queue: { plate, arrivedAt }[]`. Not implemented (no contract edits).
2. **Bay assignment at the gate.** `visitId` carries the bay (`V-yyyymmdd-Bnn-seq`), so a truck gets its bay when it arrives and queues for it. `arrivedAt` is the gate time (first read), so wait time and detention include the yard queue.
3. **Timeline events are auto-closed.** `truck.arrived/docked/started/finished/departed`, `belt.state_changed`, `roster.captain_detected`, `system.camera_ok` are informational: REST status `CLOSED` by `system`, and an `EventLifecycleUpdate` CLOSED is emitted right after each one so the alert store agrees. They never count in `openAlerts`.
4. **Hygiene events are per flagged item** (the literal rates make ~250 per day). To keep open-alert counts believable, open info/warn alerts of the previous shift are closed by the system at each shift change ("Closed at shift handover"); criticals stay open. `camera_ok` closes its `camera_offline` alert.
5. **Belt camera outage hides items.** While a `BELT` camera is offline the belt shows `OFFLINE`, no CaseTicks are emitted and counters do not advance, but the truck keeps loading and finishes on schedule (data gap, as in production).
6. **Worker behaviour only in MSW.** `GET /analytics/people` derives idle/phone minutes from crew presence (`/__mock/presence`, an internal route) with a seeded hash; the simulator core contains no such concept (a test greps its source).
7. **Admin PUTs persist in memory only.** `PUT /admin/thresholds` does change the running simulation; shifts, SKUs, bays, cameras, alert rules, telegram and users are stored and returned but do not alter the simulated day. `PUT /admin/roster` does affect the captain of later visits.
8. **Stubs:** `GET /reports/*/export` serves csv only (pdf/xlsx return 501; the frontend has client-side export); `GET /replay` returns the window's events with empty `keyframes` and `actors` (P2).
9. **Screenshots** are written to `docs/screens/step-03-*.png` as the CLAUDE.md definition of done asks; that folder is not in the ownership list, so remove them if the main session prefers. Running the full `pnpm e2e` also rewrites the tracked `docs/screens/step-04-debug.png`; I restored it byte-for-byte from `HEAD`.
10. **`public/mockServiceWorker.js` is prettier-formatted.** `format:check` covers `public/` and the generated file is not in `.prettierignore`. Formatting does not change behaviour (MSW's integrity check is a constant). Better: ignore it (request 4 below) and re-run `msw init` to get the pristine file.
11. **Default scenario is `now`** (start = the wall clock, so timestamps match the browser clock). Outside the evening peak the depot is quiet; use the panel's "Evening peak" (fixed start 2026-10-24 19:20, deterministic across reloads) or the `scenario` init option.

## Requests to main session

1. **Factory** (`src/data/DataSource.ts`), replace the mock branch:
   ```ts
   import { MockSource } from './mock';
   // ...
   case 'mock':
     return new MockSource(opts);
   ```
   (`FixtureSource` can stay for unit tests.) `src/data/index.ts` may additionally `export { MockSource } from './mock';`.
2. **MSW start-up** (`src/main.tsx`), before rendering, mock mode only:
   ```ts
   if (import.meta.env.VITE_DATA_MODE === 'mock') {
     const { startMockApi } = await import('@/data/msw');
     await startMockApi({ apiBase: import.meta.env.VITE_API_BASE });
   }
   ```
   The service worker file is served from `/mockServiceWorker.js`. Production builds that never reach this branch do not bundle MSW or the simulator.
3. **MockControls mount** (for example in `DebugReadout` or next to it, dev builds only):
   ```tsx
   {import.meta.env.DEV && <MockControls source={dataSource} />}
   ```
   with `import { MockControls } from '@/data/mock';` and `dataSource` from the DataSource context. It renders nothing for any other source.
4. **`.prettierignore`**: add `public/mockServiceWorker.js`.
5. **Alert UI / stores**: info timeline events arrive as `event` followed by a system `CLOSED` lifecycle (deviation 3); the alert store handles it, but the bell and toasts should keep filtering on `status !== 'CLOSED'` and `sev`.
6. **docs/PROGRESS.md**: tick step 3 and link this file. Add `docs/screens/step-03-*.png` to the screenshot list.
7. **Optional contract change** (deviation 1): a queue of waiting trucks on `BayState` or `SiteState` if step 8 wants waiting trucks in the yard.
8. **`createDataSource` call sites** in the shell should connect once; the runtime is shared, so `MockSource` instances created by React StrictMode are harmless.

## Risks and open questions

- Waiting-truck visibility (deviation 1).
- With the literal event rates the Alerts tab will be busy: ~250 hygiene warnings per day. Tune `bay.ts` (`item()` flag probabilities) if the client wants fewer demo alerts.
- The staleness rule in the stores uses receive time; at 60x the simulated clock runs ahead of the wall clock, so top-bar clocks that read message `ts` will move fast. That is expected in mock mode.
- Everything except the e2e runs without a browser; Web Worker behaviour was verified only in Chromium.

## Commands and results

| Command | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm lint` | pass |
| `pnpm format:check` | pass |
| `pnpm test` | 26 files, 648 tests passed |
| `pnpm i18n:check` | ok |
| `pnpm contract:check` | ok (7 json blocks, 0 unmapped) |
| `pnpm build` | pass (the simulator and MSW are not in the app bundle until the main session mounts them) |
| `E2E_PORT=4174 pnpm e2e` | 9 passed (6 existing + 3 new) |
| `pnpm exec msw init public --save=false` | ran (worker file generated, then formatted) |

Not run: anything against a real backend or NATS; Firefox/Edge for the worker and service worker.
