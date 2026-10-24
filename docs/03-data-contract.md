# 03 — Data Contract (v1) — SOURCE OF TRUTH

Shared by the frontend (zod schemas) and the backend (state-engine, wh-api). Any change: bump `v`, update this file
first, then code. All timestamps are ISO-8601 with offset (`2026-10-24T19:50:45.120+06:00`). Event IDs are ULIDs.
Every JSON example in this file is a **valid fixture**: no placeholders, internally consistent.

## 0. Coordinate frames and units
- **Bay-local frame** (all positions in messages): metres; origin = centre of the dock door opening **at dock floor level**
  (`building.floorLevel` above yard grade). `+y` points into the building; `+x` points to the right when standing in the yard
  facing the door; `z` up (rarely used). Yard positions have negative `y`.
- **Heading `h`**: radians, `0` = facing `+y` (into the building), positive = counter-clockwise seen from above, range `(-π, π]`.
- Site frame and three.js mapping are defined in `docs/04-scene-spec.md` §2.1; the backend never sends site-frame coordinates.

## 1. Identifiers
| Thing | Format | Example |
|---|---|---|
| site | slug | `dhk-depot` |
| bay | `B01`–`B07` | `B03` |
| camera | `{bay}-{ROLE}` | `B03-BELT`, `B03-CREW`, `B03-DOCK` |
| visit | `V-{yyyymmdd}-{bay}-{seq4}` | `V-20261024-B03-0007` |
| track | `t-{n}` person / `f-{n}` forklift, unique per business day | `t-88` |
| employee | from roster | `EMP-1043` |
| sku | SKU master code, or `UNKNOWN` | `RIN-PB-1KG` |
| event | ULID | `01M5Q2V6W0M9S346Q3D25VT4F5` |

## 2. NATS subjects (browser subscribes read-only)
| Subject | Kind | Rate | Payload |
|---|---|---|---|
| `wh.{site}.state.site` | core | on change, ≤ 1 Hz | `SiteState` |
| `wh.{site}.state.bay.{bay}` | core | on change, ≤ 2 Hz | `BayState` |
| `wh.{site}.live.bay.{bay}.actors` | core | 2 Hz while anyone present, else 0.2 Hz | `ActorsFrame` |
| `wh.{site}.live.bay.{bay}.case` | core | per item (typ. ≤ 3/s per bay) | `CaseTick` |
| `wh.{site}.evt.{category}.{type}` | JetStream `WH_EVENTS` (30 d) | on occurrence | `WhEvent` |
| `wh.{site}.lifecycle` | core | on ack/close/note | `EventLifecycleUpdate` |
| `wh.{site}.health` | core | 0.1 Hz | `HealthFrame` |

Browser subscriptions: `wh.{site}.state.>`, `wh.{site}.live.>`, `wh.{site}.evt.>`, `wh.{site}.lifecycle`, `wh.{site}.health`.

**Privacy rule (binding):** worker behaviour (phone use, idle time per person) is **never published on NATS** in any form.
It is written by the state-engine directly to `people_minutes` and served only by `GET /analytics/people` to permitted roles.

## 3. Payloads

### 3.1 SiteState
```json
{
  "v": 1, "ts": "2026-10-24T19:50:45.120+06:00", "site": "dhk-depot",
  "businessDay": "2026-10-24",
  "shift": { "id": "B", "start": "2026-10-24T14:00:00+06:00", "end": "2026-10-24T22:00:00+06:00" },
  "kpi": {
    "casesOut": 18240, "casesIn": 3120,
    "casesOutDeltaPct": 6.2, "casesInDeltaPct": -3.1,
    "trucksOnSite": 9, "trucksDocked": 6, "trucksWaiting": 3,
    "baysRunning": 5, "baysTotal": 7,
    "avgTatMin": 63, "avgTatDeltaMin": -4,
    "complianceScore": 91,
    "openAlerts": { "info": 4, "warn": 3, "critical": 0 }
  }
}
```
Deltas compare with the same clock time on the previous business day; `null` when unavailable.

### 3.2 BayState
```json
{
  "v": 1, "ts": "2026-10-24T19:50:45.120+06:00", "site": "dhk-depot", "bay": "B02",
  "door": { "status": "OPEN" },
  "belt": {
    "status": "RUNNING_LOADED",
    "since": "2026-10-24T19:31:02+06:00",
    "direction": "OUT", "directionSource": "AUTO",
    "rateCpm": 14.2,
    "shiftSec": { "runningLoaded": 9800, "runningEmpty": 1410, "stopped": 3300, "noTruck": 6535 }
  },
  "visit": {
    "visitId": "V-20261024-B02-0007",
    "plate": { "bn": "ঢাকা মেট্রো-ড ১১-২১৭১", "en": "DHAKA METRO-DA 11-2171", "conf": 0.93 },
    "agency": { "bn": "সিটি এক্সপ্রেস ট্রান্সপোর্ট", "en": "CITY EXPRESS TRANSPORT" },
    "phase": "LOADING",
    "arrivedAt": "2026-10-24T19:12:40+06:00", "dockedAt": "2026-10-24T19:18:05+06:00",
    "startedAt": "2026-10-24T19:31:02+06:00", "finishedAt": null, "departedAt": null,
    "casesIn": 0, "casesOut": 412, "expected": null, "etaMin": 13, "etaSource": "HISTORICAL",
    "damage": 1, "openTape": 0, "tornSack": 0, "fallOff": 0,
    "skuTop": [ { "sku": "RIN-PB-1KG", "count": 212, "conf": 0.91 }, { "sku": "UNKNOWN", "count": 9, "conf": 0 } ]
  },
  "crew": {
    "total": 6, "captains": 1, "workers": 4, "forkliftOps": 1,
    "captain": { "present": true, "trackId": "t-88", "employeeId": "EMP-1043",
                 "name": { "en": "Md. Rahim Uddin", "bn": "মোঃ রহিম উদ্দিন" }, "idSource": "ROSTER+VEST" },
    "ppeViolationsNow": 0
  },
  "staging": { "occupancyPct": 62, "palletsWaiting": 3, "oldestWaitSec": 240 },
  "today": { "casesOut": 2410, "casesIn": 380, "trucks": 9, "avgTatMin": 58, "damage": 7, "fallOff": 2, "ppe": 3 },
  "health": { "cams": { "B02-DOCK": "OK", "B02-CREW": "OK", "B02-BELT": "OK" }, "lagMs": 420 },
  "alerts": { "open": 2, "maxSev": "warn" }
}
```
Rules: `belt.shiftSec` values sum to seconds elapsed since `shift.start`. `visit` is `null` when no truck is present.
`crew.captain` is `null` when no captain is assigned; `name` is `null` for users not permitted to see names (wh-api/NATS
publish names only if the site setting `showCaptainNames` is true; default **false** until the client confirms).
Enums:
- `door.status`: `OPEN | CLOSED | UNKNOWN`
- `belt.status`: `RUNNING_LOADED | RUNNING_EMPTY | STOPPED | NO_TRUCK | OFFLINE`
- `belt.direction`: `OUT | IN | NONE`; `directionSource`: `AUTO | WMS | CONFIG`
- `visit.phase`: `ARRIVED | DOCKED | LOADING | UNLOADING | FINISHED | DEPARTED`
- `etaSource`: `HISTORICAL | WMS | NONE`
- `crew.captain.idSource`: `ROSTER | ROSTER+VEST | REID | UNCONFIRMED`
- camera status: `OK | OFFLINE | OBSTRUCTED | DEFOCUS | MOVED`
- severity: `info | warn | critical`

### 3.3 ActorsFrame
```json
{
  "v": 1, "ts": "2026-10-24T19:50:45.500+06:00", "site": "dhk-depot", "bay": "B02",
  "actors": [
    { "id": "t-88", "kind": "PERSON", "role": "CAPTAIN", "x": 1.8, "y": 4.2, "h": 1.57, "act": "SCANNING", "ppeOk": true },
    { "id": "t-91", "kind": "PERSON", "role": "WORKER", "x": -0.6, "y": 5.0, "h": 0.2, "act": "HANDLING", "ppeOk": true },
    { "id": "t-95", "kind": "PERSON", "role": "WORKER", "x": 2.4, "y": 7.1, "h": 3.1, "act": "STATIONARY", "ppeOk": false },
    { "id": "f-2", "kind": "FORKLIFT", "role": "FORKLIFT_OP", "x": 4.0, "y": 11.5, "h": -1.57, "act": "CARRYING", "ppeOk": null }
  ]
}
```
- `kind`: `PERSON | FORKLIFT`; `role`: `CAPTAIN | WORKER | FORKLIFT_OP | UNKNOWN`
- `act` (animation hint only, not a behaviour metric): `HANDLING | SCANNING | WALKING | STATIONARY | CARRYING | DRIVING | UNKNOWN`
- `ppeOk`: boolean, or `null` when not evaluated (forklifts, occluded persons).
- No names or employee IDs in ActorsFrame.

### 3.4 CaseTick
```json
{ "v": 1, "ts": "2026-10-24T19:50:45.310+06:00", "site": "dhk-depot", "bay": "B02",
  "dir": "OUT", "sku": "RIN-PB-1KG", "pack": "SACK", "conf": 0.91, "flag": null }
```
`dir`: `OUT | IN`; `pack`: `CASE | SACK | SHRINK`; `flag`: `null | DAMAGED | OPEN_TAPE | TORN_SACK | WET_STAINED`.

### 3.5 WhEvent
```json
{
  "v": 1, "id": "01M5Q2V6W0M9S346Q3D25VT4F5",
  "ts": "2026-10-24T19:50:45.120+06:00", "site": "dhk-depot", "bay": "B02",
  "category": "hygiene", "type": "damaged", "sev": "warn",
  "title": { "en": "Damaged case on belt", "bn": "বেল্টে ক্ষতিগ্রস্ত কার্টন" },
  "src": { "cam": "B02-BELT", "model": "hygiene-v1.2", "conf": 0.87 },
  "refs": { "visitId": "V-20261024-B02-0007", "trackId": null, "sku": "RIN-PB-1KG", "plateEn": "DHAKA METRO-DA 11-2171" },
  "data": { "sku": "RIN-PB-1KG", "pack": "SACK" },
  "media": { "snapshotKey": "evidence/dhk-depot/2026-10-24/01M5Q2V6W0M9S346Q3D25VT4F5.jpg",
             "clipKey": "evidence/dhk-depot/2026-10-24/01M5Q2V6W0M9S346Q3D25VT4F5.mp4",
             "bbox": [412, 220, 180, 140], "frameW": 1920, "frameH": 1080 },
  "pos": { "x": 0.2, "y": 3.5 }
}
```
- `bay`, `refs.*`, `media`, `pos` may be `null`. `media.clipKey` may be `null` (snapshot only).
- `bbox` = `[x, y, w, h]` in source-frame pixels.
- Subject = `wh.{site}.evt.{category}.{type}`; the payload's `category`/`type` must match the subject.

**Event catalogue** (one row per type; `sev` is the default, rules may override):

| category | type | sev | data |
|---|---|---|---|
| truck | arrived | info | `{ visitId, plateEn, at }` |
| truck | docked | info | `{ visitId, plateEn, at }` |
| truck | started | info | `{ visitId, plateEn, at, dir }` |
| truck | finished | info | `{ visitId, plateEn, at, casesOut, casesIn }` |
| truck | departed | info | `{ visitId, plateEn, at, tatMin }` |
| truck | detention | warn | `{ visitId, phase, minutes, thresholdMin }` |
| truck | unknown_plate | warn | `{ plateBn, plateEn, conf }` |
| belt | state_changed | info | `{ from, to }` |
| belt | empty_run | warn | `{ minutes }` |
| belt | fall_off | warn | `{ sku, pack }` |
| hygiene | damaged | warn | `{ sku, pack }` |
| hygiene | open_tape | warn | `{ sku, pack }` |
| hygiene | torn_sack | warn | `{ sku, pack }` |
| hygiene | wet_stained | warn | `{ sku, pack }` |
| hygiene | spillage (P1b) | info | `{ areaM2 }` |
| hygiene | debris (P1b) | info | `{ areaM2 }` |
| handling | rough_handling (P1b) | warn | `{ trackId, dropHeightM }` |
| ppe | violation | warn | `{ trackId, role, missing: ("vest"\|"gloves"\|"helmet"\|"shoes")[] }` |
| compliance | on_belt | critical | `{ trackId }` |
| compliance | crowding | warn | `{ count, limit }` |
| compliance | forklift_proximity | critical | `{ trackId, forkliftId, distM }` |
| roster | captain_detected | info | `{ employeeId, trackId }` |
| roster | captain_absent | warn | `{ employeeId, minutes }` |
| staging | pallet_wait | warn | `{ palletsWaiting, oldestWaitSec }` |
| security | after_hours_presence | critical | `{ count }` |
| security | door_open_idle | warn | `{ minutes }` |
| security | truck_entry_no_loading | warn | `{ trackId }` |
| system | camera_offline | critical | `{ cam }` |
| system | camera_obstructed | warn | `{ cam }` |
| system | camera_defocus | warn | `{ cam }` |
| system | camera_moved | warn | `{ cam }` |
| system | camera_ok | info | `{ cam }` |
| system | pipeline_lag | warn | `{ lagMs }` |

Nullable fields inside `data` (`sku`, `employeeId`, `trackId`, `areaM2`, `dropHeightM`) may be `null` when unknown.

### 3.6 EventLifecycleUpdate (`wh.{site}.lifecycle`)
```json
{ "v": 1, "id": "01M5Q2V6W0M9S346Q3D25VT4F5", "site": "dhk-depot",
  "status": "ACK", "by": { "userId": "u-07", "name": "Shift Supervisor B" },
  "at": "2026-10-24T19:52:10+06:00", "note": null }
```
`status`: `OPEN | ACK | CLOSED`. Notes are appended with `status` unchanged and `note` set.

### 3.7 HealthFrame
```json
{ "v": 1, "ts": "2026-10-24T19:50:40+06:00", "site": "dhk-depot",
  "cams": [ { "cam": "B01-DOCK", "status": "OK", "fps": 15.0, "lastFrameAt": "2026-10-24T19:50:39.900+06:00" },
            { "cam": "B01-CREW", "status": "OK", "fps": 15.0, "lastFrameAt": "2026-10-24T19:50:39.880+06:00" } ],
  "pipeline": { "lagMs": 380, "gpuPct": 71, "host": "gpu-tower-01" } }
```

## 4. REST API (`/api`, JSON, JWT httpOnly cookie)

### 4.1 Common shapes
```ts
type Lang = { en: string; bn: string };
type Page<T> = { items: T[]; nextCursor: string | null };
type ApiError = { error: { code: string; message: string; details?: unknown } };      // non-2xx
type Series = { key: string; label: Lang; points: { t: string; v: number | null }[] }; // t = ISO bucket start
type Role = 'HQ_VIEWER' | 'DC_MANAGER' | 'SHIFT_SUPERVISOR' | 'SECURITY' | 'ADMIN' | 'KIOSK';
type User = { id: string; name: string; role: Role; sites: string[]; lang: 'en' | 'bn' };
type NatsCreds = { wsUrl: string; user: string; token: string; expiresAt: string };   // subscribe-only
type SiteSummary = { id: string; name: Lang; baseUrl: string; baysTotal: number; baysRunning: number;
                     status: 'ONLINE' | 'DEGRADED' | 'OFFLINE' };
type EventStatus = 'OPEN' | 'ACK' | 'CLOSED';
type WhEventWithStatus = WhEvent & { status: EventStatus;
  ack: { by: string; at: string } | null; closed: { by: string; at: string; note: string } | null;
  notes: { by: string; at: string; text: string }[] };
type Visit = {
  visitId: string; site: string; bay: string;
  plate: { bn: string; en: string; conf: number }; agency: Lang | null;
  dir: 'OUT' | 'IN' | 'MIXED'; phase: string;            // BayState.visit.phase enum
  arrivedAt: string; dockedAt: string | null; startedAt: string | null; finishedAt: string | null; departedAt: string | null;
  dwell: { waitToStartMin: number | null; activeMin: number | null; postLoadMin: number | null; totalMin: number | null };
  casesOut: number; casesIn: number; expected: number | null;
  hygiene: { damaged: number; openTape: number; tornSack: number; wetStained: number; fallOff: number };
  sku: { sku: string; name: Lang | null; pack: 'CASE' | 'SACK' | 'SHRINK'; count: number; conf: number }[];
  captain: { employeeId: string; name: Lang | null } | null;
  eventIds: string[]; detention: boolean };
type LeaderboardRow = { rank: number; employeeId: string; name: Lang | null; bays: string[];
  metrics: { casesOut: number; casesIn: number; trucks: number; casesPerHour: number; avgTatMin: number | null;
             damageRatePct: number; ppeCompliancePct: number; stoppedPct: number };
  score: number; scoreParts: Record<'throughput' | 'tat' | 'damage' | 'compliance' | 'idle', number>;
  mixFactor: number; trend: number[] };
```

### 4.2 Endpoints
| Method & path | Returns |
|---|---|
| `POST /auth/login` `{username,password}` | `{ user: User, natsCreds: NatsCreds }` |
| `POST /auth/logout` | `204` |
| `GET /me` | `User` |
| `POST /auth/nats-refresh` | `NatsCreds` |
| `GET /sites` | `SiteSummary[]` |
| `GET /sites/{site}/config` | `SiteConfig` (shape of `config/sites/*.json`) |
| `GET /sites/{site}/snapshot` | `{ site: SiteState, bays: BayState[], openEvents: WhEventWithStatus[], health: HealthFrame }` |
| `GET /events?site&from&to&since&category&sev&bay&status&q&cursor&limit` | `Page<WhEventWithStatus>` |
| `GET /events/{id}` | `WhEventWithStatus` |
| `POST /events/{id}/ack` · `POST /events/{id}/close {note}` · `POST /events/{id}/note {text}` | `WhEventWithStatus` |
| `GET /media/presign?key=` | `{ url: string, expiresAt: string }` |
| `GET /visits?site&from&to&bay&plate&agency&cursor&limit` | `Page<Visit>` |
| `GET /visits/{visitId}` | `{ visit: Visit, events: WhEventWithStatus[] }` |
| `GET /analytics/throughput?site&from&to&bucket=hour\|day&bay&dir` | `{ series: Series[] }` (one per bay × dir) |
| `GET /analytics/dwell?site&from&to&groupBy=bay\|agency` | `{ groups: { key: string; label: Lang; n: number; waitToStartMin: number; activeMin: number; postLoadMin: number; p90TotalMin: number; detentions: number }[]; histogram: { binMin: number; count: number }[] }` |
| `GET /analytics/belt-utilisation?site&from&to` | `{ bays: { bay: string; sec: Record<'runningLoaded'\|'runningEmpty'\|'stopped'\|'noTruck'\|'offline', number>; intervals: { status: string; start: string; end: string }[] }[] }` |
| `GET /analytics/sku?site&from&to&bay&visitId` | `{ rows: { sku: string; name: Lang \| null; pack: string; count: number; avgConf: number }[]; unknownSharePct: number }` |
| `GET /analytics/compliance?site&from&to` | `{ byType: { type: string; count: number }[]; heatmap: { bay: string; hour: number; count: number }[]; score: Series }` |
| `GET /analytics/hygiene?site&from&to` | `{ bySku: {...}[]; byBay: {...}[]; byAgency: {...}[] }` each row `{ key, label: Lang, damaged, openTape, tornSack, wetStained, fallOff, ratePct }` |
| `GET /analytics/productivity?site&from&to` | `{ rows: { bay: string; shift: string; casesPerManHour: number; avgCrew: number; palletWaitP50Sec: number; palletWaitP90Sec: number }[] }` |
| `GET /analytics/people?site&from&to&bay` | **DC_MANAGER, ADMIN only.** `{ rows: { bay: string; shift: string; trackId: string; role: string; idleMin: number; phoneMin: number }[] }` |
| `GET /analytics/camera-uptime?site&from&to` | `{ cams: { cam: string; uptimePct: number; incidents: number }[] }` |
| `GET /leaderboard?site&period=shift\|day\|week\|month&date&shift` | `{ period, from, to, rows: LeaderboardRow[], weights: Record<string, number> }` |
| `GET /reports/shift?site&date&shift` · `GET /reports/daily?site&date` | `{ kpi: SiteState['kpi']; bays: {...}[]; captains: LeaderboardRow[]; visits: Visit[]; topEvents: WhEventWithStatus[]; sku: {...}[] }` |
| `GET /reports/{shift\|daily}/export?…&fmt=pdf\|xlsx\|csv` | file (server-side export; the frontend also offers client-side export) |
| `GET /replay?site&from&to` (P2, ≤ 10 min per call) | `{ keyframes: { ts: string; bays: BayState[] }[]; actors: ActorsFrame[]; events: WhEvent[] }` |
| Admin `GET/PUT` | see 4.3 |

### 4.3 Admin objects
```ts
type Shift = { id: string; name: Lang; start: 'HH:mm'; end: 'HH:mm' };                 // GET/PUT /admin/shifts → { businessDayStart, shifts: Shift[] }
type RosterAssignment = { date: string; shiftId: string; bay: string; employeeId: string; assignedBy: string; at: string };
                                                                                          // GET/PUT /admin/roster?site&date&shift → RosterAssignment[]
type Employee = { employeeId: string; name: Lang; role: 'CAPTAIN' | 'WORKER' | 'FORKLIFT_OP'; active: boolean };  // GET /admin/employees
type Sku = { sku: string; modelClass: string; name: Lang; pack: 'CASE' | 'SACK' | 'SHRINK'; unitsPerPack: number; color: string };
                                                                                          // GET/PUT /admin/skus
type BayCfg = { id: string; label: Lang; conveyor: string; directionMode: 'AUTO' | 'INBOUND' | 'OUTBOUND'; enabled: boolean };
type CameraCfg = { cam: string; bay: string; role: 'DOCK' | 'CREW' | 'BELT'; rtspHost: string; enabled: boolean };  // no credentials ever
type Thresholds = typeof config.thresholds;                                               // GET/PUT /admin/thresholds
type AlertRule = { id: string; site: string; categories: string[]; minSev: 'info' | 'warn' | 'critical'; bays: string[] | 'ALL';
  channel: 'TELEGRAM'; chatId: string; cooldownMin: number; quietHours: { start: 'HH:mm'; end: 'HH:mm' } | null; enabled: boolean };
type TelegramCfg = { botConfigured: boolean; botName: string | null; digestChatIds: string[]; digestAtShiftEnd: boolean };  // token never returned
type AdminUser = User & { active: boolean; lastLoginAt: string | null };                  // GET/PUT /admin/users
// POST /admin/alert-rules/{id}/test → 204 (sends a test Telegram message)
```

## 5. Timescale tables (backend-owned; listed so reports line up)
`events` · `event_status_log` · `visits` · `counts_1m (site,bay,dir,sku,pack,count,ts)` · `belt_intervals (bay,status,start,end)` ·
`bay_state_5s` (jsonb, replay) · `actors_1s` (replay, compressed) · `people_minutes (site,bay,shift,track,role,idle_min,phone_min)` ·
`camera_health` · `roster_assignments` · `employees` · `skus` · `shifts` · `users` · `alert_rules` · `notifications_log` · `audit_log`.
Continuous aggregates: hourly and daily by bay, SKU, captain and agency.
