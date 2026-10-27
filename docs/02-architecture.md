# 02 — Architecture

## 1. End-to-end flow
```
 21 IP cameras (3 per bay)
        │ RTSP
        ▼
 ┌─────────────────────────── Jetson / GPU tower (on-prem) ───────────────────────────┐
 │ DeepStream pipelines ──raw per-frame detections──►  raw.{site}.{cam}.det           │
 │        (ZeroMQ allowed here: internal, ultra-low-latency, no persistence)          │
 │                                   │                                                │
 │                                   ▼                                                │
 │  state-engine (NEW, backend)  tracking → homography → rules → aggregation          │
 │     ├─► Redis            current state  (site, bays, visits)                       │
 │     ├─► NATS core        wh.{site}.state.*   (≤2 Hz, on change)                    │
 │     │                    wh.{site}.live.*    (actors 2 Hz, cases per item)         │
 │     ├─► NATS JetStream   wh.{site}.evt.>     (stream WH_EVENTS, durable)           │
 │     ├─► MinIO            evidence/{site}/{date}/{eventId}.jpg|.mp4                 │
 │     └─► TimescaleDB      events, counts_1m, bay_state_5s, actors_1s, visits …     │
 │                                                                                    │
 │  event-sink      WH_EVENTS → Postgres (events table)                               │
 │  notifier        WH_EVENTS → rules → Telegram Bot API  (needs outbound HTTPS)      │
 │  wh-api (FastAPI) REST: auth, snapshots, history, reports, media presign, admin    │
 │  NATS server     WebSocket listener for browsers (read-only users)                 │
 │  Nginx           https://depot-twin.lan  →  /  static SPA                           │
 │                                            /api   → wh-api                          │
 │                                            /nats  → NATS websocket                  │
 │                                            /media → MinIO (presigned)               │
 └────────────────────────────────────────────────────────────────────────────────────┘
        │ LAN (HTTPS + WSS, same origin)
        ▼
 Desktop PCs / video-wall PC: Chrome or Edge → React SPA (this repo)
```

## 2. Decisions (ADR summary)
| # | Decision | Why | Rejected |
|---|---|---|---|
| ADR-1 | **NATS** is the bus. The browser connects **directly to NATS over WebSocket** (`@nats-io/nats-core` `wsconnect`) with a **read-only** user. | Already in the backend. Native WS support removes a relay service. Pub/sub fan-out to many browsers. JetStream gives durability for events. | Custom WS relay in wh-api (more code, another hop); Kafka/MQTT (no need). ZeroMQ stays internal-only (browser can't speak it). |
| ADR-2 | **Snapshot over REST + deltas over NATS.** On connect: subscribe first, then `GET /api/sites/{id}/snapshot`; apply messages with newer `ts` only. On reconnect: `GET /api/events?since=lastTs` to backfill. | Simple and correct; no JetStream consumer permissions in the browser. | JetStream KV watch from browser (needs JS API perms, harder to secure). |
| ADR-3 | **Aggregation happens in the backend** (`state-engine`). Browser never sees raw detections. | Bandwidth, CPU on desktop PCs, one source of truth for metrics and reports. | Client-side aggregation. |
| ADR-4 | **DataSource abstraction** with `mock`, `live`, `replay` implementations. | Mock-first development; replay reuses the same renderer. | — |
| ADR-5 | **Same origin behind Nginx** with an internal-CA TLS cert. | No CORS; WSS works; one URL for users. | Separate ports. |
| ADR-6 | **Evidence = snapshot + 6–10 s clip** (H.264 MP4) per event, stored in MinIO; presigned URL (15 min TTL). | Client said no live streams; clips settle disputes. | WebRTC/HLS live. |
| ADR-7 | **Replay storage now, replay UI in P2.** `bay_state_5s` + `actors_1s` hypertables with compression. | Retro-fitting history later is impossible; storage is cheap. | — |
| ADR-8 | **Procedural 3D** from `config/sites/*.json`; no GLB dependency for v1 (optional GLB swap later per object type). | Fast iteration, tiny bundle, works offline, multi-site by config. | Hand-modelled scene per site. |
| ADR-9 | **React 19** with R3F 9, drei 10, Tailwind CSS 4 (`@tailwindcss/vite`), current shadcn CLI, zod 4, react-router 7 (declarative mode, `react-router` package). Supersedes "React 18" in the original stack. | R3F 9 and drei 10 require React 19; React 18 would pin the core 3D layer to frozen majors (R3F 8, drei 9) and force Tailwind 3 + an old shadcn CLI. Router 6 is maintenance-only; v7 declarative mode is the same API. | React 18 (frozen majors); router v6. Fallback if `echarts-for-react` rejects React 19 peers: a 40-line ECharts wrapper over `echarts/core`. |
| ADR-10 | ~~No postprocessing in v1.~~ **Superseded by ADR-11.** High tier = soft shadows + contact shadows + 2× DPR; no SSAO. | Keeps the stack small; reference style is flat and soft. | `@react-three/postprocessing` (revisit after step 14 profiling). |
| ADR-11 | **Visual fidelity per docs/06:** add `@react-three/postprocessing` (N8AO ambient occlusion + SMAA on High/Med; none on Low), drei `Environment` from local `Lightformer`s (no HDR download), rounded/bevelled geometry, Khronos PBR Neutral tone mapping (ACES/AgX desaturate the docs/06 palette). | The user rejected the flat, sharp-edged look; the reference's softness comes from AO + environment lighting + rounded geometry. Low tier keeps weak PCs fast. | Keeping ADR-10 (flat look rejected); baked lightmaps (too much tooling). |
| ADR-12 | **3D props from NVIDIA SimReady** (`nvidia/PhysicalAI-SimReady-Warehouse-01`, CC-BY-4.0): forklift, plastic rackable pallets, crates, cartons, pallet truck, barcode scanner. Offline pipeline (dev machine only): USD → glTF (Blender headless) → `gltf-transform` (weld, simplify to a per-asset triangle budget, meshopt, KTX2 off) → `public/models/*.glb`. SimReady textures are **dropped**; meshes are re-materialised with docs/06 palette materials so the scene keeps one visual language. Loaded lazily with `useGLTF` + MeshoptDecoder (bundled, no CDN), instanced where repeated. Attribution in `docs/ATTRIBUTION.md` and the About dialog. | Real, accurate geometry for forklifts/pallets/crates at no modelling cost; CC-BY allows commercial use with attribution. Dropping photoreal textures keeps the soft docs/06 look and keeps files small. | Hand-modelled props (slow); using SimReady textures as-is (photoreal clashes with the reference style, 1–3 MB per asset). Not covered by SimReady: telescopic conveyor, Bangladeshi covered van, people — stay procedural. |

## 3. Frontend data layer
```ts
// src/data/DataSource.ts
export type DataMode = 'mock' | 'live' | 'replay';
export type Unsub = () => void;
export interface Subscribable<T> { get(): T; subscribe(cb: (v: T) => void): Unsub } // minimal, no RxJS
export type ConnStatus = 'connecting' | 'live' | 'degraded' | 'offline';
export interface DataSourceOptions { mode: DataMode; siteId: string; baseUrl: string } // baseUrl '' = same origin
export interface DataSource {
  readonly mode: DataMode;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  status: Subscribable<ConnStatus>;
  onSiteState(cb: (s: SiteState) => void): Unsub;
  onBayState(cb: (b: BayState) => void): Unsub;
  onActors(cb: (a: ActorsFrame) => void): Unsub;  // 2 Hz per bay
  onCase(cb: (c: CaseTick) => void): Unsub;       // per item on belt
  onEvent(cb: (e: WhEvent) => void): Unsub;
  onLifecycle(cb: (u: EventLifecycleUpdate) => void): Unsub;
  onHealth(cb: (h: HealthFrame) => void): Unsub;
  // replay only
  seek?(t: Date): Promise<void>; play?(speed: number): void; pause?(): void;
}
export function createDataSource(opts: DataSourceOptions): DataSource;
```
- **MockSource** runs `simulator.worker.ts` (Web Worker) that emits contract-valid messages for a believable depot day
  (see build plan step 3). Deterministic with a seed; speed multiplier (1×, 10×, 60×).
- **NatsSource** subscribes to the subjects in `03-data-contract.md` §2, decodes JSON, validates with zod, forwards.
- **ReplaySource** pulls keyframes and events from `/api/replay` and plays them on a virtual clock.

### Stores (zustand)
- `liveStore`: `site`, `bays: Record<BayId, BayState>`, `actors: Record<BayId, ActorsFrame>` (kept outside React render
  via `subscribe` for the 3D), `visits`, `lastTs`, `stats.dropped`.
- `alertStore`: open events, unread count, ack actions (optimistic, confirmed by REST).
- `uiStore`: selection `{kind, id}`, camera target, x-ray, labels, quality tier, language, theme, tray tab.
- `sessionStore`: user, role, sites, permissions.

REST via react-query hooks in `data/api/queries.ts`; MSW handlers in mock mode return contract-shaped data.

## 4. Connection resilience
- Exponential reconnect (1 s → 30 s). Show `degraded` if no state message for 10 s, `offline` after 30 s.
  A grey banner reads "Live data paused since 19:52 — reconnecting"; the 3D scene desaturates.
- On reconnect: snapshot + event backfill. Dedupe events by `id` (ULID).
- Per-bay staleness: if no message for a bay has been **received** for > 15 s (local receive time, not message `ts`,
  so clock skew and simulator speed-up cannot fake staleness; `ts` still drives ordering), that bay renders with a hatched "no data" overlay (camera health
  usually explains why).

## 5. Security
- Login via wh-api (username/password, P1; Entra ID / AD later if Unilever requires). Returns a JWT (httpOnly cookie)
  and short-lived NATS user credentials scoped to `wh.{allowedSites}.>` subscribe-only.
- RBAC enforced **server-side** in wh-api and in NATS permissions; the frontend gating is UX only.
- Worker behaviour data (phone, idle per person) is served only by `GET /analytics/people` to DC_MANAGER and ADMIN.
  It is never published on NATS in any form (contract §2 privacy rule), because NATS cannot filter fields per role.
- Audit log for ack, close, roster change, config change.

## 6. Performance budget
- Target 60 fps on a mid-range desktop (GTX 1650 class); ≥ 30 fps on Intel UHD 620 at "Low" quality.
- First load < 3 s on LAN; JS < 1.5 MB gzip (code-split analytics/admin/replay).
- **Rules:**
  1. Live messages update stores; 3D components read stores via `useLiveStore.subscribe` refs, **not** React state.
  2. Actor movement is interpolated in `useFrame` between the last two frames (2 Hz in → 60 fps out).
  3. Cases on belts, pallets, crates, trees and fence posts use `InstancedMesh`.
  4. `frameloop="demand"` when the tab is hidden; `PerformanceMonitor` auto-steps quality
     (`High`: soft shadows + contact shadows, 2× DPR; `Med`: contact shadows only, 1.5× DPR; `Low`: no shadows, 1× DPR). N8AO on High/Med (ADR-11).
  5. Labels via drei `Html` only for selected or hovered objects plus pins; otherwise use `Text` (SDF) or sprites.
  6. Charts: ECharts with `useDirtyRect`, data decimation for > 2k points.
- Video-wall PC: dedicated `/wall` route, fixed "Med" quality, auto-cycle every 30 s (site → each active bay → KPIs).

## 7. What the backend must provide (hand this list to the backend team)
1. **state-engine**: from raw detections, produce the messages in the contract at the stated rates. It owns:
   tracking, **per-camera floor homography** (pixel → bay-local metres), role classification (vest class + scanner),
   roster join, belt state machine, visit state machine, counters, SKU mapping, rule evaluation, event emission, evidence capture.
2. **Event evidence**: snapshot (JPEG, ≤ 1280 px, bbox drawn optional) + clip (6–10 s around the event) into MinIO.
3. **NATS**: WebSocket listener behind Nginx `/nats`; stream `WH_EVENTS` (subjects `wh.*.evt.>`, 30-day retention);
   read-only browser users.
4. **wh-api** endpoints in contract §4, including report and leaderboard aggregates from Timescale continuous aggregates.
5. **Timescale** hypertables in contract §5, compression after 7 days, retention policy per table.
6. **notifier** with rule table and Telegram bot token in env.
7. **Camera health** heartbeat per camera every 10 s.
8. Clock sync (NTP/chrony) on all hosts and cameras; all timestamps ISO-8601 with `+06:00`.
9. **Bay assignment by floor polygon, not by camera.** The overhead CREW frames show two conveyors in one view, so a CREW
   camera may see people from two bays. After homography, assign each track to the bay whose floor polygon contains it.
10. Worker behaviour minutes go only to `people_minutes`; ActorsFrame `act` carries animation hints only (`STATIONARY`, never `PHONE`).

## 8. Deployment (on-prem)
- Frontend: `pnpm build` → static files served by Nginx on the GPU tower (or any LAN box). Docker image `depot-twin-web`.
- Browsers: Chrome or Edge latest, hardware acceleration ON. Kiosk: Chrome `--kiosk https://depot-twin.lan/wall`.
- Multi-site later: each depot runs its own edge stack; HQ either connects to each depot's URL (site switcher holds base URLs)
  or a central aggregator is added. The DataSource factory takes `{siteId, baseUrl}` so both work.
