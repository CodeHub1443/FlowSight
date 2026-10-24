# 05 — Build Plan (paste each prompt into Claude Code, one step per session)

Each step ends with the CLAUDE.md "Definition of done". Do not start step N+1 until step N's screenshots look right
and the step has been reviewed.
These prompts describe **what** to build. Each session is started with a task brief (`docs/OPERATING_RULES.md` §7)
that sets model, mode, effort, permissions and stop conditions. Commits happen only when a brief authorises them,
using the message `step-NN: <title>`.

**Parallel work (after step 4 is committed):** steps 3, 5 and 6 run in separate git worktrees with this ownership:
- Step 3 simulator: `src/data/mock/**`, `src/data/msw/**`, `public/mockServiceWorker.js`, i18n namespace `mock`, `docs/progress/step-03.md`.
- Step 5 shell: `src/features/live/**`, `src/components/common/**`, `src/app/AppShell.tsx` and new files under `src/app/shell/**`, namespace `live`, `docs/progress/step-05.md`.
- Step 6 static 3D: `src/scene/**` only, exporting `<SceneRoot/>` from `src/scene/index.ts` and a dev preview route component in `src/scene/dev/ScenePreview.tsx`; namespace `scene`, `docs/progress/step-06.md`. The shell provides a `<SceneSlot/>`; neither session mounts the other's component.
- Main session only: `src/domain/**`, `src/stores/**`, `src/data/DataSource.ts`, `src/data/index.ts`, `src/i18n/index.ts`, namespace `common`, `docs/PROGRESS.md`, `package.json`, lockfile, configs.
  Parallel sessions report needed changes to these in their final report instead of editing them. New dependencies: stop and ask.
- After merge the main session switches `createDataSource` from FixtureSource to MockSource and mounts `<SceneRoot/>` in `<SceneSlot/>`.

---

## Step 0: Baseline brief and plan (READ-ONLY, no code)
**You do (manually):**
1. Repo root contains `CLAUDE.md`, `docs/` (incl. `docs/OPERATING_RULES.md`), `config/`.
2. Start Claude Code in that folder. It loads `CLAUDE.md` automatically every session.

**Content of the task** (wrapped in the Step-0 task brief):
```
Read CLAUDE.md and every file in docs/ and config/. Inspect git status, branch and commit. Do not write any files.
Report: (1) project baseline brief per OPERATING_RULES §3 Stage 2, (2) the build steps in docs/05,
(3) contradictions or gaps between the docs with file and section evidence, (4) the exact package list and versions
proposed for step 1, (5) decisions needed before step 1.
```
Acceptance: the summary is correct; contradictions are resolved by the user (doc edits) before step 1.

---

## Step 1: Scaffold
```
Do step 1 from docs/05-build-plan.md, at the repo root.
Scaffold Vite 7 + React 19 + TypeScript strict with pnpm 10 (Corepack). Install the stack in CLAUDE.md (ADR-9), pinned exactly.
Root config: .npmrc (save-exact, engine-strict), .nvmrc, "packageManager" and "engines" in package.json, pnpm.onlyBuiltDependencies,
.editorconfig, Prettier, ESLint 9 flat config (no-explicit-any: error), tsconfig (strict, noUncheckedIndexedAccess, @/* alias, resolveJsonModule).
Tailwind 4 via @tailwindcss/vite + shadcn/ui (current CLI): button, card, tabs, dialog, dropdown-menu, tooltip, badge, table, input, select,
sheet, sonner, scroll-area, separator, avatar, switch. (sonner only; no legacy toast.)
react-router 7 (declarative) with placeholder pages for every route in docs/01 §3: / → /live, /live, /bays/:bayId, /trucks, /analytics,
/leaderboard, /events, /events/:id, /reports, /replay, /wall, /admin with children shifts, roster, skus, bays, cameras, thresholds,
alert-rules, users, telegram; /login; 404.
react-i18next with en.json/bn.json; scripts/i18n-check.mjs (plain Node) fails on a key missing from either file or an empty bn value.
@fontsource inter + noto-sans-bengali (no CDN). src/index.css: light and dark tokens: brand, the semantic status tokens from CLAUDE.md
"Style", and the scene palette tokens from docs/04 §1.
Env via Vite modes: .env (VITE_DATA_MODE=mock, VITE_API_BASE=/api, VITE_NATS_URL=/nats), .env.live (VITE_DATA_MODE=live); typed ImportMetaEnv.
Scripts: dev, dev:live (vite --mode live), typecheck, lint, format, format:check, test (vitest run), e2e, i18n:check, build, preview.
Tests (real, no --passWithNoTests): i18n checker unit test with a missing-key fixture; App render test that toggles EN/বাং and asserts the
Bangla sample string; Playwright smoke test screenshotting / at 1920x1080 and 1366x768 into docs/screens/step-01-*.png.
Create the folder structure from CLAUDE.md with index.ts files only (no domain, store or scene logic).
public/brand placeholder logos (simple SVG text "Unilever" and "TDI", marked PLACEHOLDER).
docs/PROGRESS.md: checklist steps 0–16 (step 0 checked), resolved package pins, step 1 log with deviations.
```
Acceptance: all scripts pass; the app shows an empty shell; the EN/বাং toggle switches a sample string.

---

## Step 2: Domain types and schemas
```
Do step 2. From docs/03-data-contract.md generate src/domain/enums.ts, types.ts and schemas.ts (zod) for every payload:
SiteState, BayState, ActorsFrame, CaseTick, WhEvent, WhEventWithStatus, EventLifecycleUpdate, HealthFrame, Visit, User, NatsCreds, SiteSummary, Page, Series, LeaderboardRow, admin objects (§4.3), SiteConfig (matching config/sites/dhk-depot.json),
and the REST response shapes in §4. Infer TS types from zod (z.infer). Add src/domain/fixtures/ with one valid JSON per payload
copied verbatim from the contract (every example there is a valid fixture), plus unit tests that every fixture parses and that obviously invalid variants fail.
Add src/lib/format.ts (numbers en/bn digits with lakh grouping, durations "1h 05m"/"১ ঘ ০৫ মি", plate display bn+en) and src/lib/time.ts (Asia/Dhaka helpers, shift boundary math using the shifts config). Test both.
```

---

## Step 3: Mock simulator (the depot comes alive)
```
Do step 3. Build src/data/DataSource.ts (interface from docs/02 §3) and MockSource backed by src/data/mock/simulator.worker.ts.
The simulator must produce contract-valid messages for dhk-depot, 7 bays, seeded and deterministic, speed 1x/10x/60x:
- Trucks arrive at the gate every 6–15 min in the evening peak (17:00–23:00) and sparsely otherwise; wait in the holding lane if all bays are busy;
  dock; start after 5–25 min; load 250–900 items at 8–20 cpm with short stoppages; finish; depart. ~80% OUT, 20% IN.
- Bangla plates: "ঢাকা মেট্রো-{ট|ড|ন|শ} {১১-৪০}-{৪ digits}" with an English transliteration ("DHAKA METRO-TA/DA/NA/SHA ...").
- SKUs (mock names, replace with SKU master later): Rin Power Bright 1kg (SACK 20 units), Rin 500g, Wheel 1kg (SACK), Surf Excel 500g, Lux soap 100g,
  Lifebuoy soap 100g, Sunsilk 180ml, Vim bar, Pepsodent 200g, Closeup 145g, Glow & Lovely 50g, Pond's 100g, Vaseline 100ml, Dove 175ml; 3–5% UNKNOWN.
- Crew per active bay: 1 captain (full vest, scanner), 3–6 workers, 1 forklift op; positions in the bay-local zones from config with plausible motion;
  acts per contract §3.3 (STATIONARY, never PHONE); forklift shuttles staging ↔ aisle.
- Worker phone/idle minutes exist only in the MSW handler for GET /analytics/people (never on live subjects).
- Events at realistic rates: damaged 0.5%, open_tape 0.3%, torn_sack 0.4% of sacks, fall_off ~1/bay/day, PPE violation ~3/shift,
  detention when thresholds are exceeded, empty_run, pallet_wait, one camera_offline per day that recovers, rare compliance.on_belt.
- Each event gets a placeholder evidence image key; MSW serves generated placeholder JPEGs (canvas: grey frame + bbox + label) and a tiny sample MP4.
- SiteState and BayState aggregates must be consistent with emitted CaseTicks and visits.
Add a dev-only overlay (Ctrl+Shift+D) with speed, seed, "trigger event" buttons and message rates.
Also add MSW handlers for every REST endpoint in docs/03 §4, computing responses from simulator history held in memory (last 7 simulated days pre-generated at startup in the worker).
```
Acceptance: Vitest validates 10 000 simulated messages against the schemas with 0 failures; the overlay shows live rates.

---

## Step 4: Stores and connection status
```
Do step 4. Implement zustand stores per docs/02 §3 (liveStore, alertStore, uiStore, sessionStore), the snapshot+delta merge logic
(ignore older ts; dedupe events by id), staleness detection (bay > 15s, site degraded > 10s, offline > 30s) and a ConnectionBadge.
Provide hooks: useBay(bayId), useSiteKpi(), useOpenAlerts(filter), and non-React accessors for the 3D (getBay, subscribeBay).
Unit-test merge, dedupe and staleness.
```

---

## Step 5: App shell (2D first, reference-video layout)
```
Do step 5. Build the /live layout from docs/01 §3.1 with a grey placeholder where the 3D canvas will go:
TopBar (logo, product name from i18n, global search with grouped results: bays/trucks/captains/SKUs/events, site switcher, LIVE/MOCK/REPLAY badge
with Asia/Dhaka clock, connection dot, bell with dropdown, EN/বাং, theme, user menu), KPI chips (from SiteState with deltas),
Inspector card (generic renderer + specific bodies for site, bay, truck/visit, person, forklift, staging, event with evidence thumbnail),
bottom-right Tray (tabs Bays/Trucks/Alerts/Captains with live rows), bottom-left Visit tracker stepper.
Match the look of docs/reference/ui-ref-*.jpg: white floating cards, 12px radius, soft shadow, small caps labels, coloured status pills, thin progress bars.
Everything RBAC-gated and bilingual. Responsive down to 1366x768; panels collapsible.
```

---

## Step 6: 3D site (static)
```
Do step 6. Build the static scene from config/sites/dhk-depot.json and docs/04 §1–2: ground, road, yard with guide lines and holding lane,
boundary wall + gate + guard booth, the shed with twin-gable roof, striped south facade, canopy, 7 dock doors with numbers,
neighbouring shed, instanced trees, lighting, fog, camera + OrbitControls with limits and presets (docs/04 §6), quality tiers with PerformanceMonitor.
The scene builder must be generic (any dock face, any bay count). Place it in the /live placeholder. Compare against docs/reference/ui-ref-9.jpg and ui-ref-30.jpg and iterate until the style matches.
```

---

## Step 7: 3D interior and actors (static props)
```
Do step 7. Add per-bay interior from docs/04 §3: telescopic conveyor (fixed body + extendable boom), control cabinets with "Conveyor-0n" labels,
staging pallets (instanced; blue/yellow/orange), crate stacks, storage blocks (instanced case stacks), forklift aisle markings,
camera glyphs at cameraTemplate mounts. Build actor components: Truck (BD covered van, liveries, rear plate via Html), Person (captain full vest + scanner,
worker cross-vest, forklift op), Forklift. X-ray mode toggle and auto-fade on zoom. Use docs/reference/cam-*.jpg to sanity-check proportions.
```

---

## Step 8: Bind live data to the scene
```
Do step 8. Bind DataSource → stores → scene: truck state machine animations (approach from gate, wait in holding lane, reverse to door, docked, depart),
boom extend/retract, belt status colours + UV speed from rateCpm, item spawning per CaseTick with SKU colours and flagged items,
actor interpolation in useFrame (no React state per frame), staging pallet counts, door shutters, camera-offline glyphs, event pins.
Selection: click any object → uiStore.selection → Inspector; tray/search rows fly the camera. Verify 60fps on High and ≥30fps on Low at 60x speed.
```

---

## Step 9: Alerts and evidence centre
```
Do step 9. Toasts for warn+, bell, Alerts tab, /events page (filters: time, bay, category, severity, status, text; virtualised table),
event detail drawer with snapshot (bbox overlay from media.bbox), clip player, refs (visit, SKU, plate), ack/close/note with optimistic update,
lifecycle updates from evt.lifecycle.update, deep link /events/:id. reportOnly events never toast, pin or appear for unpermitted roles.
```

---

## Step 10: Analytics and leaderboard
```
Do step 10. /analytics tabs per docs/01 §4 using ECharts: Throughput (hourly in/out by bay, stacked), Trucks & Dwell (stacked dwell breakdown per visit,
detention list, transporter scorecard), Productivity (cases per man-hour by bay/shift, staging wait), Compliance (PPE by type/hour/bay heatmap),
Hygiene (damage by SKU/bay/agency, evidence gallery), SKU (counts, unknown share, confidence), Equipment (belt Gantt per bay, running-empty minutes, camera uptime).
/leaderboard: captain ranking with period switch, score breakdown, mix-normalisation note, sparkline trends; worker rows only for permitted roles.
Global date-range + shift picker. Every chart has an empty state, a loading skeleton and a confidence footnote.
```

---

## Step 11: Reports and exports
```
Do step 11. /reports: shift report and daily report views (KPIs, per-bay table, per-captain table, truck log, top events with thumbnails, SKU summary),
print-ready CSS, export PDF (client-side via the browser print-to-PDF flow with a dedicated print layout), XLSX (SheetJS) and CSV. Bangla PDF must render correct glyphs.
```

---

## Step 12: Auth, RBAC and admin
```
Do step 12. Login page, mocked auth with one user per role, route guards, permission matrix in src/lib/rbac.ts with tests.
Admin screens: shifts, roster (assign captain per bay per shift; drag-and-drop), SKU master (class → SKU, names en/bn, pack, colour), bays & cameras,
thresholds, alert rules (site × category × severity → Telegram chat, cooldown, quiet hours; "send test" button calls the API), users & roles.
All forms validated with zod; all labels bilingual.
```

---

## Step 13: Live backend wiring
```
Do step 13. Implement NatsSource with @nats-io/nats-core wsconnect using creds from /auth/login, the subjects in docs/03 §2,
subscribe-then-snapshot, reconnect with backoff, backfill via /events?since, zod validation with a dropped-message counter in the dev overlay.
Implement the real REST client (same hooks as MSW). Add a contract test script `pnpm contract:check <baseUrl>` that calls every endpoint and
validates responses, and `pnpm nats:probe <wsUrl>` that subscribes for 60s and reports schema failures per subject.
Do not change any UI component; if you need to, explain why in PROGRESS.md.
```

---

## Step 14: Video wall and performance
```
Do step 14. /wall kiosk route per docs/04 §7 and docs/02 §6, large type scale, auto-cycle, no hover UI, auto-recover after network loss.
Profile with the R3F perf monitor and Chrome performance at 60x mock speed; fix anything breaking the budget in docs/02 §6.
Code-split analytics, admin, reports and replay. Report bundle sizes in PROGRESS.md.
```

---

## Step 15: Replay (P2)
```
Do step 15. ReplaySource from /api/replay (chunked), /replay page with a timeline scrubber (events as ticks coloured by severity, bay state bands),
play/pause, 1x/4x/16x/60x, jump-to-event, "open in replay" from any event or visit. The same scene renders replay with an amber REPLAY badge.
```

---

## Step 16: Packaging
```
Do step 16. Dockerfile (multi-stage, Nginx serving the SPA with SPA fallback), nginx.conf example proxying /api, /nats (websocket upgrade) and /media,
docs/DEPLOY.md for the on-prem LAN (internal TLS, Chrome kiosk flags, hardware acceleration check, offline install of the image).
```
