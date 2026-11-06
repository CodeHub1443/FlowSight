# CLAUDE.md — DepotFlow for Unilever Bangladesh (frontend)

You are building the **browser frontend** of a real-time 3D digital twin and analytics app for the
**Unilever Bangladesh Dhaka Central Sales Depot**: one building, **7 truck bays**, each with
**1 telescopic conveyor (belt)** behind the dock door. Built by **TDI (The Data Island)**; the product
carries **Unilever branding** with a "Developed by TDI" credit.

The backend (built by TDI separately) is a DeepStream CV pipeline with **3 cameras per bay (21 total)**:
- `DOCK` cam: truck + licence plate (Bangla LPR, OCR'd to English, both stored)
- `CREW` cam: overhead view of workers, staging pallets, crates and forklift
- `BELT` cam: top-down view of cases/sacks on the belt (count, direction, SKU, damage)

It publishes **aggregated state and events** on **NATS** (core + JetStream) and exposes a **REST API**.
History lives in PostgreSQL + TimescaleDB, cache in Redis, evidence media in MinIO (S3).
Everything runs **on-prem on a LAN**. The browser runs on ordinary desktop PCs and a control-room video wall.

**Visual target:** the reference video "WareTrack" (frames in `docs/reference/video/*.jpg` and `docs/reference/ui-ref-*.jpg`): a light,
game-like 3D scene, clickable objects, floating KPI chips at the top, an inspector card on the right, a tabbed list tray at the bottom
right and a visit tracker at the bottom left. **Unlike the video, the 3D focus is the inside of the shed** (roofless cutaway: belts,
crews, staging, forklifts, truck rears at the doors), because almost nothing happens outside. See `docs/04-scene-spec.md` §0.

## Operating rules (read first)
- This repo follows `docs/OPERATING_RULES.md`. Every session starts with a **task brief** from the user
  (Model / Mode / Effort header + objective, scope, permissions, acceptance, stop conditions).
- **The task brief sets mode and permissions.** The prompts in `docs/05-build-plan.md` describe *what* to build;
  they never authorise actions on their own.
- Without explicit authorisation in the brief: no file edits (outside READ-ONLY reporting), no dependency installs,
  no commits, pushes, branch or worktree operations, no deletes, no external network calls.
- **Precedence when sources conflict:** task brief > `CLAUDE.md` > `docs/03-data-contract.md` (for message, subject
  and endpoint shapes) > `docs/01`, `docs/02`, `docs/04` > `docs/05` > reference images. If a conflict changes behaviour,
  **stop and report**; do not resolve it silently.
- Every session ends with the final report format in `docs/OPERATING_RULES.md` §7.

## Read before any work
1. `docs/01-product-spec.md`: users, roles, features, the analytics catalogue, alerts
2. `docs/02-architecture.md`: data flow, DataSource layer, transport, performance rules
3. `docs/03-data-contract.md`: **the source of truth** for every message, subject and endpoint
4. `docs/04-scene-spec.md`: the 3D site, building, bays, actors, look and feel
5. `docs/06-visual-language.md`: **binding** colours, 3D quality, card styling, no-flicker rules
6. `docs/05-build-plan.md`: the ordered steps; do exactly one step per session unless told otherwise
7. `config/sites/dhk-depot.json`: site geometry and bay and camera config (data, not code)
8. `docs/PROGRESS.md`: create it if missing; update it at the end of every step

## Non-negotiable rules
- **Mock-first.** Every screen must work with `VITE_DATA_MODE=mock` (in-browser simulator) before it is wired
  to the real backend. Never block on the backend.
- **Single data boundary.** UI and 3D code never touch NATS, fetch or WebSocket directly. Everything goes through
  `src/data/` (`DataSource` for live data, `api/` for REST). Swapping mock, live or replay must not change any component.
- **Validate at the boundary.** Every inbound message and REST response is parsed with the zod schemas in
  `src/domain/schemas.ts` (generated from `docs/03-data-contract.md`). Invalid messages are dropped and counted, never thrown into the UI.
- **The frontend never receives raw per-frame detections.** Only the subjects listed in the contract.
- **No hard-coded strings.** Every user-visible string goes through `react-i18next` with keys in both
  `src/i18n/en.json` and `src/i18n/bn.json`. A missing Bangla key fails the `i18n:check` script.
- **Bangla-first data.** Licence plates show Bangla as primary and English as secondary. Numbers and dates go through
  `src/lib/format.ts` (supports `bn-BD` digits). All times are `Asia/Dhaka`.
- **Offline LAN.** No CDNs, no Google Fonts, no map tiles, no analytics beacons and no runtime calls to the internet.
  Fonts are bundled via `@fontsource/*`. All assets live in the repo.
- **No live video.** Evidence is snapshot JPG and short MP4 clips fetched through presigned URLs from the API.
- **Config, not code**, for site geometry, bays, cameras, shifts, SKU master, alert rules and roles.
- **RBAC everywhere.** Routes, panels, actions and data columns are gated by `src/lib/rbac.ts` (matrix in docs/01 §2).
  Worker-level behaviour data (phone use, idle) exists only in `GET /analytics/people` for `DC_MANAGER` and `ADMIN`;
  it is never on NATS, never live, never in the 3D scene. The simulator must not emit it on live subjects either.
- **3D performance rules** (see architecture §6): no React state updates per frame, instancing for repeated meshes,
  interpolate actors in `useFrame`, store updates ≤ 4 Hz, quality tiers.

## Metric admission rule (standing rule, from Task 19)
- Every metric in **prime dashboard space** (KPI chips, KPI popovers, the top sections of the bay inspector) must answer a
  management question and support a management decision. A metric without a row in the metric admission table
  (`docs/tasks/t19-spec.md` §3) does not ship in prime space. It may live in a collapsed "More details" block or in
  `/analytics`, never beside the headline numbers.
- A value that **cannot be measured** at this depot is **hidden**, not shown as a permanent "—". A "—" is for a value that is
  temporarily unknown, with a tooltip saying why.

## Stack (do not swap without an ADR in docs/02; see ADR-9, ADR-11)
Node 22 LTS (≥ 22.12) · pnpm 10 via Corepack · Vite 7 · React 19 · TypeScript 5 (strict, no `any`) ·
@react-three/fiber 9 · @react-three/drei 10 · three · zustand 5 · @tanstack/react-query 5 · zod 4 ·
react-router 7 (declarative mode, `react-router` package) · Tailwind CSS 4 (`@tailwindcss/vite`) · shadcn/ui (current CLI, Radix) ·
sonner (toasts) · lucide-react · react-i18next · ECharts 5 (echarts-for-react, or a thin wrapper if peers reject React 19) ·
date-fns 4 + date-fns-tz · @nats-io/nats-core (wsconnect) · MSW 2 · Vitest + Testing Library · Playwright · ESLint 9 (flat) + Prettier.
Fonts: `@fontsource/inter`, `@fontsource/noto-sans-bengali`. `@react-three/postprocessing` for N8AO + SMAA on High/Med (ADR-11).
Versions are pinned exactly (`save-exact`); the resolved pins are recorded in `docs/PROGRESS.md`.

## Folder structure
```
src/
  app/            router, providers, AppShell, route guards
  domain/         types.ts, schemas.ts (zod), enums.ts, ids.ts
  data/
    DataSource.ts       interface + factory (mock | live | replay)
    mock/               simulator.worker.ts, generators/, MockSource.ts
    nats/               NatsSource.ts, subjects.ts
    replay/             ReplaySource.ts
    api/                client.ts, endpoints.ts, queries.ts (react-query hooks)
    msw/                handlers.ts (REST mocks)
  stores/         liveStore.ts, uiStore.ts, sessionStore.ts, alertStore.ts
  scene/          SceneRoot.tsx, camera/, site/, building/, bay/, actors/, labels/, materials.ts, quality.ts
  features/       live/, bays/, trucks/, analytics/, leaderboard/, events/, reports/, replay/, wall/, admin/, auth/
  components/     ui/ (shadcn), common/
  i18n/           index.ts, en.json, bn.json
  lib/            utils.ts (shadcn cn), format.ts, time.ts, rbac.ts, color.ts, units.ts
config/sites/     <siteId>.json
public/brand/     unilever-logo.svg (official asset supplied by client; placeholder until then), tdi-logo.svg
docs/
```

## Commands (keep these working)
- `pnpm dev` (mock mode by default) · `pnpm dev:live` (`vite --mode live`, reads `.env.live`; no inline env vars, the dev machine is Windows)
- `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm e2e` · `pnpm i18n:check` · `pnpm build`
- One test file or folder: `pnpm test <path>` (e.g. `pnpm test src/features/analytics`). Not `pnpm exec vitest run <path>`, which fails
  on `vitest.setup.ts`. Under load the full suite has known 5 s timeouts: `pnpm test --testTimeout=60000`, then rerun a failure alone.
- One e2e spec: `pnpm exec playwright test e2e/<spec>.ts` (builds and serves the app itself); never the full e2e suite without a brief.

## Definition of done (every step)
1. `pnpm typecheck && pnpm lint && pnpm test && pnpm i18n:check` all pass.
2. The feature works in mock mode. Take a Playwright screenshot of the screen at 1920×1080 and at 1366×768
   into `docs/screens/` and look at it yourself before declaring done.
3. Both languages render (toggle EN/বাং) with no overflow or clipped Bangla glyphs.
4. `docs/PROGRESS.md` is updated with what was done, what's stubbed and any deviation from the docs.
5. If a message shape must change, **stop and propose** the change to `docs/03-data-contract.md`; edit the contract
   only when the brief approves it, then update the schemas.
6. The final report (OPERATING_RULES §7) lists changed files, exact commands and results, and checks not run.
7. Nothing is committed unless the brief authorises it.

## Style
- Light theme default (matches reference), plus dark "control room" theme. Colours only via CSS variables/tokens
  defined in `src/index.css` and mirrored in `scene/materials.ts`.
- Brand primary: Unilever blue. A placeholder token (`--brand-500`) until the official brand kit arrives; never hard-code it elsewhere.
- **`docs/06-visual-language.md` is authoritative for every colour, radius, shadow, type and motion value; where it differs from this section, docs/06 wins.**
- Semantic status tokens: `--status-ok`, `--status-warn`, `--status-critical`, `--status-neutral`, `--status-idle`, `--status-offline`,
  `--status-info` (also selection). Values and the scene palette: `docs/06` (`src/index.css` carries them).
  Belt-state → token mapping is in `docs/04-scene-spec.md` §5.
- Site facade colours in `config/sites/*.json` are physical paint (site data), the one allowed exception to "tokens only".
- Compact, dense, legible at 3 m on a video wall: min 14 px body on desktop, 18 px on `/wall`.

## Branding (t22 spec section 2; docs/06 section 7.9)
- The product is **DepotFlow** (never translated); the client is Unilever Bangladesh; the credit is "Developed by TDI Pvt. Limited". Names live in `src/brand.ts`, never in a translation or a component.
- Use the components in `src/components/common/Brand.tsx` (`ClientLogo`, `ProductMark`, `ProductName`, `ProductLockup`, `DevelopedBy`); `AboutDialog` is loaded with `React.lazy`. Never draw a logo with a bare `<img>`.
- The Unilever logo is used unmodified: no recolouring, cropping, stretching, shadow or opacity; minimum height 32 px. The DepotFlow artwork is interim and white-background only: a white tile in the dark theme.

## Do not
- Do not invent new message fields silently; propose them in the contract doc.
- Do not use Google Maps or satellite imagery in the app (licensing + offline). The site is modelled procedurally from config.
- Do not add a backend to this repo. MSW mocks and the simulator stand in for it.
- Do not put PII (names, employee IDs) in URLs, logs or localStorage.
