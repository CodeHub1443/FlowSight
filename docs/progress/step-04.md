# Step 4: Stores and parallel-work enablers

Baseline: `e1112fd step-02b: schemas match contract clarifications` (tree clean at start). Nothing committed by this session.

## What was built
- **DataSource** (`src/data/DataSource.ts`): the docs/02 section 3 interface verbatim (`DataMode`, `Unsub`, `Subscribable`, `ConnStatus`, `DataSourceOptions`, `DataSource` with `onLifecycle` and `onHealth`), `createDataSource(opts)`, and a typed `NotImplementedError`. Mode `mock` returns `FixtureSource`; `live` and `replay` throw `NotImplementedError`.
- **FixtureSource** (`src/data/fixture/`): emits the seven contract fixtures verbatim on connect, then a sweep (SiteState, ActorsFrame and BayState for B01 to B07) immediately and every 2 s; HealthFrame every 10 s. Bay variants derive from the B02 fixture (visit phase, belt status, door, crew, alerts, plate and visit id per bay; B06 has an offline CREW camera). Every message goes through `safeParseMessage`. Deterministic for a given start time.
- **Stores** (`src/stores/`): `liveStore`, `alertStore`, `uiStore`, `sessionStore`, hooks, non-React accessors, staleness and clock helpers, `wire.ts` (DataSource to stores).
- **DataSourceProvider** (`src/app/`), `UiPreferenceSync` (i18n, `dark` class and uiStore stay in step), and a debug readout toggled with **Ctrl+Shift+D**.
- **i18n split** into five namespaces per language, `i18n:check` validates every pair.
- **E2E network guard** (`e2e/fixtures.ts`): any request to a host other than localhost or 127.0.0.1 is blocked and fails the test. The existing smoke test uses it; a spec proves the guard works.

## Merge rules (as implemented)
- Live messages and a REST snapshot go through the same reducer; a message whose `ts` is **older** than the stored one is counted as received and otherwise ignored (equal `ts` is applied, so duplicates are idempotent).
- Events are deduped by id. Lifecycle moves OPEN, ACK, CLOSED forward only; a note (status unchanged, `note` set) is appended; an update older than the last applied one is ignored; an update that arrives before its event is parked (bounded) and applied when the event arrives.
- Store writes are coalesced and flushed every 250 ms (4 Hz); no timer runs while idle.
- Staleness: bay stale after 15 s without an update; connection `degraded` after 10 s and `offline` after 30 s without a state message. Evaluated by a shared 1 Hz clock that only runs while a hook is mounted; the hooks use `useSyncExternalStore` over a primitive, so React re-renders only when the derived value changes.

## Role matrix
`src/stores/alertFilter.ts` holds the docs/01 section 2 category table as a pure function (`categoryAccess`, `canViewCategory`, `canActOnCategory`, `visibleCategories`, `filterAlerts`). The test transcribes the doc table separately and checks all 60 cells. `src/lib/rbac.ts` does not exist yet; when it lands it should take over this table.

## Dev readout
`pnpm dev`, then Ctrl+Shift+D: status `live`, 7 bays received, 0 dropped for every kind. Screenshot from the e2e run: `docs/screens/step-04-debug.png`. In production builds the readout exists only when built with `VITE_DEBUG_PANEL=1` (the e2e build sets it through `webServer.env`).

## Deviations and notes
1. **Staleness uses local receive time, not message `ts`** (docs/02 section 4 says "`ts` is more than 15 s old"). Reason: a skewed desktop clock or a sped-up simulator (1x, 10x, 60x) would make fresh data look stale. `ts` is still used for the older-message rule and `lastTs`.
2. **`pnpm dev:live` does not crash: the provider catches `NotImplementedError`, logs it, and the connection status stays offline.
3. **Snapshot messages count as received** in `stats.received` (they go through the same path as live messages).
4. **`actors` live in `liveStore`** as the docs say; React selectors are unaffected by actor updates, and `subscribeActors` fires at most once per flush (4 Hz) per bay. The 3D session should interpolate on its own clock.
5. **`i18n/index.ts` imports `@/stores/prefs`** to read the persisted language at start-up. Language and theme are the only persisted values (`depot.pref.language`, `depot.pref.theme`); reads and writes are in try/catch.
6. **The `ts` field of messages the fixture re-emits is "now" in +06:00**, but the first fixtures are emitted verbatim (their `ts` is 2026-10-24 19:50); the same-connect sweep overrides them.
7. **Unread count** is a set of live-event ids, filtered through the role matrix at read time.
8. `useBays()` re-renders on any bay change (up to 4 Hz). Per-bay consumers should use `useBay(id)`.

## Not done (out of scope)
Simulator and MockSource, MSW, NatsSource, REST snapshot call (`applySnapshot` and `mergeEvents` are ready for it), ConnectionBadge UI (step 5 reads `useConnStatus`), any feature UI beyond the debug readout.

## Grep evidence: no React state update per animation frame
`requestAnimationFrame` and `useFrame` do not appear in non-test source. The only timers are `FixtureSource` (2 s interval), the 1 Hz clock (only while subscribed) and the 250 ms store flush. The only `useState` calls are in `DataSourceProvider` (one lazy init) and `DebugReadout` (open/closed on a key press).
