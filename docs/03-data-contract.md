# 03 — Data Contract (v1, rev 1.1) — SOURCE OF TRUTH

Shared by the frontend (zod schemas) and the backend (state-engine, wh-api). Any change: update this file first, then code.
A **breaking** change bumps `v`. An **additive** change (new optional or nullable fields that older clients may ignore and
newer clients must tolerate being absent) keeps `v` and adds a revision entry to the Changelog (section 6).
All timestamps are ISO-8601 with offset (`2026-10-24T19:50:45.120+06:00`). Event IDs are ULIDs.
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
    "openAlerts": { "info": 4, "warn": 3, "critical": 0 },
    "turnaround": { "n": 41, "occupancyMin": 52, "depotTatMin": 63, "waitForDockMin": 11,
                    "preOpDelayMin": 9, "activeMin": 38, "postOpDelayMin": 5 }
  }
}
```
Deltas compare with the same clock time on the previous business day. Nullable: `casesOutDeltaPct`, `casesInDeltaPct`,
`avgTatMin` (no finished visit yet), `avgTatDeltaMin`, `complianceScore` (nothing evaluated yet).

**`complianceScore`** (rev 1.1 definition): **PPE compliance**, the percentage (0–100) of evaluated person-observations in the
current business day in which the person wore all mandatory PPE. Only PPE counts: `compliance.on_belt`, `compliance.crowding`
and `compliance.forklift_proximity` are safety events and do **not** lower this score. `null` until at least one person has been evaluated.

**`kpi.turnaround`** (rev 1.1, optional): the truck-time breakdown behind `avgTatMin`. Absent (or `null`) from backends older
than rev 1.1; clients must then fall back to `avgTatMin`. Per visit, from the BayState/Visit timestamps:

| Field | Definition (per visit) | Meaning |
|---|---|---|
| `depotTatMin` | `departedAt − arrivedAt` | Depot turnaround, what the transporter experiences. Equals `kpi.avgTatMin`. |
| `waitForDockMin` | `dockedAt − arrivedAt` | Wait before docking. On dhk-depot (no gate camera) `arrivedAt` is the first DOCK-camera read, so this is **not** "wait before bay assignment". |
| `occupancyMin` | `departedAt − dockedAt` | Bay occupancy: how long the truck holds the dock door. |
| `preOpDelayMin` | `startedAt − dockedAt` | Pre-operation delay: docked, no carton moved yet. |
| `activeMin` | `finishedAt − startedAt` | Loading (belt `OUT`) or unloading (belt `IN`) duration. |
| `postOpDelayMin` | `departedAt − finishedAt` | Post-operation delay: work finished, truck still at the door. |

- The sample is the visits **completed in the current business day**: `departedAt` set and inside the business day (the same
  sample as `avgTatMin`, which this file calls "finished visits"). `n` is the number of visits in the sample.
- Each field is the mean, in minutes, over the sample visits where both of its timestamps are present; `null` when there is none.
  When `n` = 0 every field except `n` is `null`.
- Identities (per visit, and for the means when every sample visit has all five timestamps, up to rounding):
  `occupancyMin = preOpDelayMin + activeMin + postOpDelayMin` and `depotTatMin = waitForDockMin + occupancyMin`.
- `depotTatMin` must equal `avgTatMin` (same sample, same rounding).

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
    "shiftSec": { "runningLoaded": 9800, "runningEmpty": 1410, "stopped": 3300, "noTruck": 6535, "offline": 0 }
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
    "skuTop": [ { "sku": "RIN-PB-1KG", "count": 212, "conf": 0.91 }, { "sku": "UNKNOWN", "count": 9, "conf": 0 } ],
    "skuCount": 1
  },
  "crew": {
    "total": 6, "captains": 1, "workers": 4, "forkliftOps": 1,
    "captain": { "present": true, "trackId": "t-88", "employeeId": "EMP-1043",
                 "name": { "en": "Md. Rahim Uddin", "bn": "মোঃ রহিম উদ্দিন" }, "idSource": "ROSTER+VEST" },
    "ppeViolationsNow": 0
  },
  "queue": [
    { "visitId": "V-20261024-B02-0008", "plate": { "bn": "ঢাকা মেট্রো-ট ২২-৪৮১৫", "en": "DHAKA METRO-TA 22-4815", "conf": 0.88 },
      "arrivedAt": "2026-10-24T19:41:12+06:00", "slot": 1 }
  ],
  "staging": { "occupancyPct": 62, "palletsWaiting": 3, "oldestWaitSec": 240 },
  "today": { "casesOut": 2410, "casesIn": 380, "trucks": 9, "avgTatMin": 58, "damage": 7, "fallOff": 2, "ppe": 3 },
  "health": { "cams": { "B02-DOCK": "OK", "B02-CREW": "OK", "B02-BELT": "OK" }, "lagMs": 420 },
  "alerts": { "open": 2, "maxSev": "warn" }
}
```
Rules: `belt.shiftSec` (5 keys, same keys as `/analytics/belt-utilisation`) values sum to seconds elapsed since `shift.start`.
`visit` is `null` when no truck is present. `queue` lists trucks assigned to this bay and waiting on the apron, ordered by
`arrivedAt` (empty array when none). **A visit appears in exactly one of `visit` or `queue`:** it leaves the queue when it becomes
the bay's `visit` (phase `ARRIVED`, i.e. reversing to the door); `slot` is the 1-based apron holding slot (≤ config `yard.holdingLane.slots`), or `null` if unassigned.
**`arrivedAt` semantics:** the first plate read by this site's cameras. On dhk-depot (no gate camera) that is the first DOCK-camera read;
the mock simulator models a gate read, so its detention includes yard wait. Nullable inside `visit`: `agency`, all timestamps after `arrivedAt`, `expected`,
`etaMin` (must be `null` when `etaSource` = `NONE`). Nullable inside `today`: `avgTatMin`. `alerts.maxSev` is `null` when `alerts.open` = 0.
**`visit.skuCount`** (rev 1.1, optional, nullable integer): the number of distinct SKU codes recognised on this visit so far, not counting
`UNKNOWN`. `skuTop` stays the top list and may be shorter than `skuCount`; `skuCount` is never less than the number of non-`UNKNOWN`
entries in `skuTop`. `null` when the BELT camera has not evaluated the visit; absent from backends older than rev 1.1.
`crew.captain` is `null` when no captain is assigned or detected; inside it, `trackId` is `null` when `present` = false and
`employeeId` is `null` when `idSource` = `UNCONFIRMED`; `name` is `null` for users not permitted to see names (wh-api/NATS
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
- `bay`, `refs.*`, `media`, `pos` may be `null`. `media.clipKey` may be `null` (snapshot only). `src.cam` and `src.model` may be
  `null` for events not produced by a camera model (e.g. `system.pipeline_lag`, `truck.detention`); `src.conf` is then `null` too.
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
| ppe | violation | warn | `{ trackId, role: ActorsFrame role, missing: ("vest"\|"gloves"\|"helmet"\|"shoes")[] }` |
| compliance | on_belt | critical | `{ trackId }` |
| compliance | crowding | warn | `{ count, limit }` |
| compliance | forklift_proximity | critical | `{ trackId, forkliftId: "f-{n}" track id, distM }` |
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
type BeltStatus = BayState['belt']['status'];
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
  dwell: { waitToStartMin: number | null; activeMin: number | null; postLoadMin: number | null; totalMin: number | null;
           // rev 1.1, optional (absent from older backends):
           waitForDockMin?: number | null; preOpMin?: number | null; occupancyMin?: number | null };
  casesOut: number; casesIn: number; expected: number | null;
  hygiene: { damaged: number; openTape: number; tornSack: number; wetStained: number; fallOff: number };
  sku: { sku: string; name: Lang | null; pack: 'CASE' | 'SACK' | 'SHRINK'; count: number; conf: number }[];
  captain: { employeeId: string; name: Lang | null } | null;
  eventIds: string[]; detention: boolean };
// Visit.dwell, minutes; each null while either of its timestamps is null:
//   waitToStartMin = startedAt − arrivedAt   (yard + dock wait until the first carton moves; docs/01 "wait-to-start")
//   activeMin      = finishedAt − startedAt  (loading/unloading)
//   postLoadMin    = departedAt − finishedAt (post-operation delay)
//   totalMin       = departedAt − arrivedAt  (depot turnaround)
//   waitForDockMin = dockedAt − arrivedAt    (rev 1.1; wait before docking)
//   preOpMin       = startedAt − dockedAt    (rev 1.1; pre-operation delay)
//   occupancyMin   = departedAt − dockedAt   (rev 1.1; bay occupancy = preOpMin + activeMin + postLoadMin)
type Period = 'shift' | 'day' | 'week' | 'month';
type LeaderboardRow = { rank: number; employeeId: string; name: Lang | null; bays: string[];
  metrics: { casesOut: number; casesIn: number; trucks: number; casesPerHour: number; avgTatMin: number | null;
             damageRatePct: number; ppeCompliancePct: number; stoppedPct: number };
  score: number; scoreParts: Record<'throughput' | 'tat' | 'damage' | 'compliance' | 'idle', number>;
  mixFactor: number; trend: number[] };
type SkuRow = { sku: string; name: Lang | null; pack: 'CASE' | 'SACK' | 'SHRINK'; count: number; avgConf: number };
type ReportBayRow = { bay: string; casesOut: number; casesIn: number; trucks: number; avgTatMin: number | null;
  beltSec: Record<'runningLoaded' | 'runningEmpty' | 'stopped' | 'noTruck' | 'offline', number>;
  damaged: number; openTape: number; tornSack: number; wetStained: number; fallOff: number; ppe: number; detentions: number };
type Report = { kind: 'shift' | 'daily'; site: string; businessDay: string; shiftId: string | null; from: string; to: string;
  kpi: SiteState['kpi']; bays: ReportBayRow[]; captains: LeaderboardRow[]; visits: Visit[];
  topEvents: WhEventWithStatus[]; sku: SkuRow[] };
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
| `GET /analytics/belt-utilisation?site&from&to` | `{ bays: { bay: string; sec: Record<'runningLoaded'\|'runningEmpty'\|'stopped'\|'noTruck'\|'offline', number>; intervals: { status: BeltStatus; start: string; end: string }[] }[] }` |
| `GET /analytics/sku?site&from&to&bay&visitId` | `{ rows: SkuRow[]; unknownSharePct: number }` |
| `GET /analytics/compliance?site&from&to` | `{ byType: { type: string; count: number }[]; heatmap: { bay: string; hour: number; count: number }[]; score: Series }` |
| `GET /analytics/hygiene?site&from&to` | `{ bySku: {...}[]; byBay: {...}[]; byAgency: {...}[] }` each row `{ key, label: Lang, damaged, openTape, tornSack, wetStained, fallOff, ratePct }` |
| `GET /analytics/productivity?site&from&to` | `{ rows: { bay: string; shift: string; casesPerManHour: number; avgCrew: number; palletWaitP50Sec: number; palletWaitP90Sec: number }[] }` |
| `GET /analytics/people?site&from&to&bay` | **DC_MANAGER, ADMIN only.** `{ rows: { bay: string; shift: string; trackId: string; role: string; idleMin: number; phoneMin: number }[] }` |
| `GET /analytics/camera-uptime?site&from&to` | `{ cams: { cam: string; uptimePct: number; incidents: number }[] }` |
| `GET /leaderboard?site&period=shift\|day\|week\|month&date&shift` | `{ period: Period, from: ISO datetime, to: ISO datetime, rows: LeaderboardRow[], weights: Record<'throughput'\|'tat'\|'damage'\|'compliance'\|'idle', number> }` |
| `GET /reports/shift?site&date&shift` · `GET /reports/daily?site&date` | `Report` (§4.1) |
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

## 6. Changelog

### rev 1.1 (2026-11-03): additive, payloads keep `v: 1`
Every new field is optional or nullable. A client that knows rev 1.1 must still accept payloads without the new fields and show
"—" (or fall back, see below). A client from before rev 1.1 strips the new keys.

| Where | Change | Definition |
|---|---|---|
| `SiteState.kpi.turnaround` | **new**, optional object `{ n, depotTatMin, waitForDockMin, occupancyMin, preOpDelayMin, activeMin, postOpDelayMin }` | Section 3.1. `n` is an integer ≥ 0; the other fields are minutes or `null` (all `null` when `n` = 0); `depotTatMin` = `avgTatMin`. Without it the client shows `avgTatMin` as "Avg turnaround". |
| `SiteState.kpi.complianceScore` | **definition changed**, same type | Section 3.1: PPE-only, % of evaluated person-observations with all mandatory PPE present; excludes `compliance.on_belt`, `compliance.crowding`, `compliance.forklift_proximity`. |
| `BayState.visit.skuCount` | **new**, optional, integer or `null` | Section 3.2: distinct recognised SKU codes on this visit, excluding `UNKNOWN`. |
| `Visit.dwell.waitForDockMin` | **new**, optional, number or `null` | `dockedAt − arrivedAt`. |
| `Visit.dwell.preOpMin` | **new**, optional, number or `null` | `startedAt − dockedAt`. Added because the existing `waitToStartMin` is `startedAt − arrivedAt` (it includes the wait before docking), so it cannot serve as the pre-operation delay. |
| `Visit.dwell.occupancyMin` | **new**, optional, number or `null` | `departedAt − dockedAt`. |
| `Visit.dwell.*` (existing) | **documented**, unchanged | Section 4.1 now states the formulas of `waitToStartMin`, `activeMin`, `postLoadMin`, `totalMin`. |

Backend work (wh-api / state-engine) to implement rev 1.1: publish `kpi.turnaround` on `wh.{site}.state.site`, with the same
sample and rounding as `avgTatMin`; publish `visit.skuCount` on `wh.{site}.state.bay.{bay}`; return the three new `dwell` fields
from `GET /visits` and `GET /visits/{visitId}` (and so inside `Report.visits`); compute `complianceScore` with the PPE-only definition
(also inside `Report.kpi`). `Report.kpi` shares the `SiteState.kpi` shape, so it may carry `turnaround` too.

**Proposal to backend, not implemented** (no new event type in rev 1.1; not in the section 3.5 catalogue, the frontend rejects it):
`belt.low_throughput`, default sev `warn`, raised when a bay's belt is `RUNNING_*` and its cartons/min stays abnormally low against the
bay's own recent rate (for example below 50 % of the 30-minute median for 5 minutes). Suggested data:
`{ rateCpm: number, baselineCpm: number, minutes: number }`. It would join the "Throughput & staging" alert group.
