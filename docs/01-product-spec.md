# 01 — Product Spec: Unilever Depot Twin

## 1. The story this product tells
Every evening a line of covered vans crawls into the Dhaka Central Sales Depot. Seven dock doors open, seven
telescopic belts extend into seven trucks, and a few dozen people turn pallets into dispatched cases.
Today nobody can see that rhythm while it happens. The truck that waited 90 minutes, the belt that ran empty for
40, the torn Rin sack that reached a distributor, the captain whose bay did twice the volume: all of it is lost
or argued about later.

The twin makes that rhythm visible live, and keeps a record of it. A manager opens it and sees the depot as a
living miniature: trucks backing in, belts pulsing with cases, crews at work, and a red pin above Bay 4 where a
damaged case just passed. Clicking anything shows its story and its evidence.

## 2. Users and roles

| Role | Who | Sees | Can do |
|---|---|---|---|
| `HQ_VIEWER` | Unilever HQ supply chain | All sites: KPIs, analytics, reports. Captain names only if site setting `showCaptainNames` is on (default off, open item 4); worker behaviour no | Export reports |
| `DC_MANAGER` | Depot manager | Own site(s): everything incl. worker-level behaviour reports | Configure shifts, SKU master, alert rules; acknowledge or close alerts; export |
| `SHIFT_SUPERVISOR` | On-shift supervisor | Own site: live view, bays, alerts, roster, shift reports | Assign captains to bays (roster), acknowledge alerts, add notes |
| `SECURITY` | Depot security | Own site: live view, truck log, security, compliance and hygiene events, evidence | Acknowledge security alerts, add notes |
| `ADMIN` | TDI | Everything | Users, roles, sites, bays, cameras, integrations, Telegram |
| `KIOSK` | Video-wall PC account | `/wall` only, own site, no names, no worker behaviour | Nothing |

A user has one role plus a list of site IDs. RBAC lives in `src/lib/rbac.ts` as a permission matrix
(`can(user, 'events.ack', {siteId, category})`).

**Event category visibility** (V = view, A = view + ack/close/note):

| category | HQ_VIEWER | DC_MANAGER | SHIFT_SUPERVISOR | SECURITY | ADMIN | KIOSK |
|---|---|---|---|---|---|---|
| truck | V | A | A | A | A | V |
| belt | V | A | A | V | A | V |
| hygiene | V | A | A | A | A | V |
| handling | V | A | A | V | A | — |
| ppe | V | A | A | A | A | V |
| compliance | V | A | A | A | A | V |
| roster | — | A | A | — | A | — |
| staging | V | A | A | — | A | V |
| security | — | A | V | A | A | — |
| system | V | A | A | A | A | V |

## 3. Surfaces
| Route | Purpose | Roles |
|---|---|---|
| `/live` (default) | 3D twin, KPI chips, inspector, bottom tray, visit tracker | all |
| `/bays/:bayId` | Bay deep-dive: belt timeline, current truck, crew, SKU mix, evidence | all except KIOSK; HQ read-only |
| `/trucks` | Truck visit log (plate bn/en, times, dwell breakdown, cases, damage), transporter scorecard | all |
| `/analytics` | Tabs: **Performance (first and default)** · Throughput · Trucks & Dwell · Productivity · Compliance · Hygiene · SKU · Equipment. Nested routes `/analytics` (Performance) and `/analytics/<tab>`; one shared period selector (`?range=shift\|day\|week`, default `day`). Performance (Task 20): throughput through the period against the previous one, trucks over the expected time per bay, then the bay comparison (efficiency index vs comparable trucks, where the time goes, workload context). The comparison method (cohorts by direction, pack and volume; index calibrated to the depot's typical = 100; confidence thresholds) is defined in `docs/03-data-contract.md` section 4.4 (rev 1.2) and summarised in `docs/tasks/t20-spec.md` section 2. Other tabs are placeholders | all except KIOSK |
| `/leaderboard` | Captain leaderboard (shift / day / week / month) | all except KIOSK (crew behaviour columns: DC_MANAGER, ADMIN) |
| `/events` and `/events/:id` | Alert and evidence centre: filter, view snapshot or clip, acknowledge, assign, note. `/events/:id` is the Telegram deep link | all except KIOSK, filtered by the category matrix above |
| `/reports` | Shift and daily reports, export PDF / XLSX / CSV | DC_MANAGER, HQ_VIEWER, SHIFT_SUPERVISOR, ADMIN |
| `/replay` | Rewind the 3D twin to any past moment (phase 2) | DC_MANAGER, SECURITY, ADMIN |
| `/wall` | Video-wall kiosk: auto-cycling views, large type, no chrome | KIOSK (and all roles for preview) |
| `/admin/*` | Children: `shifts`, `roster`, `skus`, `bays`, `cameras`, `thresholds`, `alert-rules`, `users`, `telegram` | ADMIN; DC_MANAGER for shifts, roster, skus, thresholds, alert-rules; SHIFT_SUPERVISOR for roster |
| `/login`, `*` (404) | Sign-in; not-found | public |

### 3.1 `/live` layout (mirrors the reference video)
- **Top bar:** Unilever logo + product name · global search (plate bn/en, bay, captain, SKU, event ID) ·
  site switcher (`Dhaka Central Depot · 5/7 bays active`) · `LIVE 19:50` badge (or amber `REPLAY` / grey `MOCK`) ·
  connection health dot · alert bell with count · EN/বাং toggle · user menu.
- **KPI chips (top-left, 4–6):** Cartons today (out / in) · Trucks on site (docked / waiting) · Bays running x/7 ·
  Bay occupancy (turnaround) · PPE compliance · Needs attention. Every chip has a row in the admission table. Deltas vs the same time yesterday where the payload has one.
  Definitions (Task 19; formulas in `docs/tasks/t19-spec.md` section 1, fields in docs/03 rev 1.1):
  - *Cartons today*: `kpi.casesOut + casesIn` with deltas. Popover: out and in today with deltas; rate now out/h and in/h
    (sum of running belts' `rateCpm` × 60 by direction; "—" when no belt runs).
  - *Bay occupancy* (headline of the turnaround chip, shown from 1700 px): mean `departedAt − dockedAt` over visits finished
    today. Popover: depot turnaround (`= avgTatMin`, with delta), pre-operation delay, loading/unloading, post-operation delay,
    wait before docking (only when non-null), a stacked bar pre-op / work / post-op and the visit count. An older backend
    without `kpi.turnaround` gets "Avg turnaround" (`avgTatMin`).
  - *PPE compliance* (shown from 2000 px): `kpi.complianceScore`, PPE only (safety events count under "Safety"), and
    "Most violations today: Bay N (count)" from `BayState.today.ppe`.
  - *Needs attention*: open warn + critical from `kpi.openAlerts`; beneath it the critical / warn / info split. Info never
    inflates the headline. Popover: open alerts by group (one config table, unknown types in "Other"); a row opens the
    Alerts tray filtered to that group.
  **Admission rule:** every number in prime space (chips, popovers, the top sections of the bay inspector) has a row in the
  metric admission table, `docs/tasks/t19-spec.md` section 3; anything else goes to "More details" or `/analytics`.
- **Bay inspector (Task 19, order per 19.9b):** plate and phase on top, then truck timeline (pre-op / loading or unloading /
  post-op, bay occupancy, finish ETA), throughput (cartons this visit, cartons/min, bay today), workforce (workers, storekeeper
  detected, forklift operator detected), bay status (door, belt direction, captain line, PPE violations now) and a collapsed
  "More details" (belt since, crew split, staging, damage, fall-offs, cameras, SKUs detected). The whole timeline is visible
  without scrolling at 1366x768. Never idle or phone time, never per-person rankings.
- **Inspector card (right):** opens on click of any object (site, bay, belt, truck, person, forklift, pallet zone, event pin).
  Header: type label, name, status chip; then a key-value list, a progress bar where relevant, and an evidence thumbnail.
  Pin button keeps it open; ↗ opens the full page.
- **Bottom-right tray:** tabs `Bays 5/7` · `Trucks 6` · `Alerts 3` · `Captains 7`. Rows are clickable and fly the camera to the object.
- **Bottom-left visit tracker:** for the selected truck: `Arrived → Docked → Loading 412/— → Finished → Departed`
  with timestamps and a dwell clock.
- **3D controls (right edge):** zoom +/−, rotate, reset, home, x-ray (roof off), labels on/off, quality.

## 4. Analytics catalogue
Phase **P1** = camera data only (now). **P2** = needs WMS API or replay storage.
Every metric is computed in the backend; the frontend renders it. Unknown or low-confidence values render as "—"
with a tooltip, never as 0.

### 4.1 Requested by the client
| # | Analytic | Definition | Cameras | Phase | Where shown |
|---|---|---|---|---|---|
| 1 | **Store keeper (captain) identification** | Captain = person in a **full hi-vis vest** who carries a **handheld scanner**. Workers wear **cross-strap vests**. Identity comes from the **shift roster** (supervisor assigns captain → bay), confirmed by vest class + scanner detection on the CREW cam. ReID keeps the track across the shift. | CREW | P1 (roster) / P2 (ReID enrolment) | Inspector (person), bay page, roster admin |
| 2 | **Captain inbound/outbound report + leaderboard** | Per captain per shift/day: cases out, cases in, trucks handled, cases/hour, avg truck turnaround, damage rate, PPE compliance, idle %. Composite score (weights configurable; default throughput 40, TAT 20, damage 15, compliance 15, idle 10) **normalised by product mix** (sacks vs cases) so bays loading Rin sacks are not penalised. | all | P1 | `/leaderboard`, reports |
| 3 | **Idle time per conveyor; phone use** | Belt: minutes `STOPPED` and minutes `RUNNING_EMPTY` (running with no product). Worker: idle minutes and phone-use minutes per track, aggregated per bay crew. **Reports only**: never on NATS, never live, never in the 3D view; served only by `GET /analytics/people` to DC_MANAGER and ADMIN. Workers are anonymous track IDs. | BELT, CREW | P1 | Reports, bay page (manager) |
| 4 | **SKU-wise count on the belt** | Artwork classifier on the BELT cam → SKU code via the SKU master mapping. Shows count by SKU per truck, bay and day, with an `UNKNOWN` bucket and avg confidence. | BELT | P1 (camera) → P2 (reconcile vs WMS) | Inspector (truck/bay), analytics SKU tab |
| 5 | **PPE and other compliance** | PPE rules **configurable per zone** (vest mandatory; gloves, helmet, safety shoes optional per client policy). Plus: person on or riding the belt, crowding at belt mouth (> N people), person in forklift path. | CREW, DOCK | P1 | Live pins, events, compliance tab |
| 6 | **Truck in/out time** | Visit timeline: `arrivedAt` (first LPR at dock) → `dockedAt` (stationary at door) → `startedAt` (first case) → `finishedAt` (last case + 3 min no flow) → `departedAt`. | DOCK, BELT | P1 | Visit tracker, `/trucks` |
| 7 | **Bays running vs idle** | Live count of bays with belt `RUNNING_LOADED` vs `RUNNING_EMPTY` / `STOPPED` / `NO_TRUCK`; per-bay Gantt over the day. | BELT, DOCK | P1 | KPI chip, tray, analytics equipment tab |
| 8 | **Belt fall-off** | A case or sack leaves the belt surface other than at the ends. Event with snapshot and clip. | BELT | P1 | Live pin, events |
| 9 | **Product hygiene** | `DAMAGED` (crushed or torn case), `OPEN_TAPE`, `TORN_SACK`, `WET_STAINED`. Counted per truck and SKU; evidence is attached to the truck visit. | BELT | P1 | Live pin, events, hygiene tab |

### 4.2 Added because they pay for themselves at this depot
| # | Analytic | Why it matters here | Phase |
|---|---|---|---|
| A | **Dwell breakdown & detention flag**: wait-to-start, active loading, post-load idle; flag visits over threshold | The yard queue and transporter disputes are the daily pain. Shows whether delay is the depot's or the truck's. | P1 |
| B | **Loading rate & live ETA**: cases/min per bay; projected finish | "13 min left" on every truck, as in the reference video. P1 uses the historical average per vehicle class; P2 uses the WMS expected quantity. | P1/P2 |
| C | **Count reconciliation vs WMS**: counted vs document per truck and SKU; shortage/excess | The headline value for Unilever: dispatch accuracy and distributor claims. | P2 |
| D | **Crew productivity**: cases per man-hour per bay and shift (crew size × time from CREW cam) | Right-sizes labour per bay and shift. | P1 |
| E | **Forklift response / staging congestion**: staging occupancy %, how long a filled pallet waits for the forklift | One forklift per bay is the likely bottleneck. Visible in your overhead frames. | P1 |
| F | **Rough handling**: cases thrown or dropped from height onto belt or pallet | Root cause of damage, not just the count. Model-dependent. | P1b |
| G | **Housekeeping / 5S**: floor debris and powder spillage near belt and staging (visible today around Conveyor-02) | Product hygiene starts on the floor. Per-bay, per-shift score. | P1b |
| H | **Transporter scorecard**: by plate and transport agency: avg dwell, punctuality, damage on their visits | Uses the LPR data already captured. | P1 |
| I | **Security**: after-hours presence at a bay; truck docked with door open and no belt activity > N min; person entering a truck with no loading; unknown or blacklisted plate | Pilferage risk at an FMCG depot. | P1 |
| J | **Camera health**: offline, obstructed, defocused or moved (tamper) | All 21 cameras are the sensors. A blind camera must be visible, not silently produce zeros. | P1 |
| K | **Shift handover digest**: auto summary to Telegram at shift end + daily PDF | The manager gets the depot's day on his phone without opening the app. | P1 |
| L | **Data confidence**: per-metric coverage and confidence badge | Builds trust with the client; honest about CV limits. | P1 |

## 5. Alerts and notifications
- Every event has `sev` = `info | warn | critical` and a category.
- **In-app:** toast (warn+), bell list, pin floating over the 3D object, row in the Alerts tab. Critical events pulse the bay.
- **Workflow:** `OPEN → ACK (who, when) → CLOSED (resolution note)`; auto-close for transient states (e.g. camera back online).
- **Telegram:** rules per site × category × severity × role group → Telegram chat ID. Cooldown and dedupe window per rule,
  quiet hours, shift digest. Messages bilingual and short, with a snapshot image and a deep link to `/events/:id`
  (the link works only on the LAN). **Needs outbound HTTPS from the on-prem server to `api.telegram.org`.**
- **Never notified:** worker phone use or idle (report-only by policy; these are not events at all).

## 6. Configuration (admin)
- **Shifts:** unknown yet, so fully configurable. Placeholder: A 06:00–14:00, B 14:00–22:00, C 22:00–06:00 (Asia/Dhaka).
  Leaderboard and daily reports reset on the configured boundaries; the "business day" start is configurable.
- **Roster:** per shift, the supervisor assigns a captain (employee) to each bay; changes mid-shift are logged.
- **SKU master:** model class ID → SKU code, name (en/bn), pack type (`CASE | SACK | SHRINK`), case size, colour for the 3D box.
- **Bays and cameras:** bay ID, label, door index, camera IDs and roles, direction mode (`AUTO | INBOUND | OUTBOUND`).
- **Thresholds:** detention minutes, idle minutes, crowding count, empty-run minutes, finished-gap minutes.

## 7. Language and format
- Full EN and বাংলা UI. Toggle in the top bar; preference saved per user (server) and in localStorage (UI only).
- Plates: `ঢাকা মেট্রো-ড ১১-২১৭১` primary, `DHAKA METRO-DA 11-2171` secondary (backend transliteration; the frontend never transliterates).
- Number system toggle: Latin or Bangla digits. Lakh/crore grouping in Bangla mode.

## 8. Phases
- **P1 (pilot, cameras only):** everything in 4.1 plus A, B(historical), D, E, H, I, J, K, L, with live view, events, reports, leaderboard, admin and Telegram.
- **P1b:** F, G (new model classes).
- **P2:** WMS integration (direction, expected qty, reconciliation C), replay, ReID enrolment, multi-site rollout.

## 9. Open items (to confirm with the client)
1. Shift timings and business-day boundary.
2. Mandatory PPE at this depot (vest only? gloves? helmet? shoes?).
3. SKU master: the class list the model outputs and the SKU codes they map to.
4. Employee roster source (HR export? manual?) and whether captain names may be shown to HQ.
5. Dock face, bay numbering order and **real door pitch** (assumed south face, B01 west → B07 east, 6.5 m pitch; the overhead
   frames show two conveyors in one CREW view, so the pitch may be tighter and one CREW camera may cover two bays).
6. Official Unilever brand kit (logo, colour, typography) and the approved product name.
7. Whether the on-prem server is allowed outbound internet for Telegram.
8. Transporter / agency master list for the scorecard.
