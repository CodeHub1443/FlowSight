# 07 — Analytics and Data Spec (draft v0.1, 2026-11-08)

Status: the owner's consolidated draft (belt, vehicle, truck-to-belt correlation, insights, reports), revised by the architect
against the current product (`docs/01-product-spec.md`) and contract (`docs/03-data-contract.md`, rev 1.3).
This file feeds **Task 24 (data platform)** and **contract rev 1.4**. Until accepted it is not binding; `docs/03` stays the
source of truth for payloads. Section 9 lists what changed from the owner's draft; section 10 lists the owner's open decisions.

**Sequence (owner decision 2026-11-09):** 22B.3 → **24 data platform** (including the tables Task 23 needs, §7.1) → 23 auth, RBAC
and admin (frontend and API on top of those tables) → 25 soak-test hardening.

## 0. Principles (apply to every metric below)
1. **Admission rule:** a metric enters a dashboard, report or alert only if it answers a named management question and supports a
   decision. Everything else is stored, not shown.
2. **Observed before inferred:** the system states what the cameras observed ("no product flow for 42 min at Bay 4"). Possible
   causes are shown only as hypotheses, labelled as such ("possible causes: no active order, staging, pause"). It never states a cause
   it did not observe.
3. **Unknown is not zero:** a missing or low-confidence value renders as "—" with a reason. A blind camera must never produce a zero.
4. **Coverage travels with the number:** every aggregate carries the share of its period that its cameras were healthy.
5. **Numbers are computed in the backend,** once, with the definitions in this file; the frontend and the reports only render them.
6. **People are never ranked.** Bays, trucks, transporters and SKUs may be compared. Bay comparisons use the normalised bay index
   (`docs/03` §4.4), never raw items per minute, so a bay that loads sacks or large orders is not marked slow for it.
7. **Terminology:** the owner's *Point* is a **bay** (`B01`–`B07`). The owner's *batch* is a **flow run** (§1.3), because "batch"
   means a manufacturing lot in Unilever's own vocabulary. A truck's stay is a **visit**.

## 1. Belt intelligence

### 1.1 Raw record per item (belt camera)
One row per unique belt crossing, stored by the backend as `belt_items` (new table, §7). It extends the live `CaseTick`.

| Field | Meaning | Status |
|---|---|---|
| `ts` | crossing time of the counting line | exists (`CaseTick.ts`) |
| `bay`, `cam` | bay and camera (`B03-BELT`) | bay exists; `cam` new |
| `objId` | tracker ID of the object, unique per camera per business day; used to de-duplicate and audit counts | **new** |
| `pack` | `CASE` / `SACK` / `SHRINK` (the owner's Box = `CASE`) | exists |
| `sku`, `conf` | SKU code or `UNKNOWN`, classification confidence | exists |
| `dir` | `OUT` (towards the truck, loading) / `IN` (unloading) | exists |
| `flag` | `null` / `DAMAGED` / `OPEN_TAPE` / `TORN_SACK` / `WET_STAINED` | exists |
| `enterTs`, `exitTs` | entering and leaving the monitored belt section | **new**, stored only (audit and speed checks), not shown |
| `model` | model name and version that produced the record | **new** |
| `visitId`, `assocConf` | the visit the item was assigned to, and the confidence of that assignment (§3) | **new**, filled by association |

Belt state is not per item: it stays the 5-state interval record `belt_intervals` (`RUNNING_LOADED`, `RUNNING_EMPTY`, `STOPPED`,
`NO_TRUCK`, `OFFLINE`), which is richer than Active/Inactive.

### 1.2 Core belt metrics
| Metric | Definition | Status | Question it answers |
|---|---|---|---|
| Items processed (out / in) | count of `belt_items` by `dir` | exists (`casesOut`, `casesIn`) | How much did we dispatch and receive? |
| Split by pack | items by `pack` (cases, sacks, shrink) | exists in SKU data; add to reports | Was this a sack-heavy day (slower to load)? |
| SKU-wise quantity | items by `sku`, with the `UNKNOWN` share | exists | What moved, and how much could the camera not identify? |
| Distinct SKUs | count of distinct non-`UNKNOWN` SKUs | exists (`skuCount`) | Context only (order complexity); not a KPI |
| Damage count and rate | flagged items ÷ items **of the same pack** × 100, per flag type | counts exist; rate new | Where and on which SKU does damage occur? |
| Reverse movement | items whose `dir` opposes the visit's dominant direction | **new** | Is there rework, returns on the belt, or a counting fault? |
| Net movement | `OUT − IN` per visit | **new** (derived) | Does the truck's net count match the order? (P2 vs WMS) |
| Belt time by state | seconds per belt state per shift | exists (`shiftSec`) | How much belt time was productive? |
| Belt utilisation | `RUNNING_LOADED` ÷ (time a truck was docked) | exists ("Belt loaded") | Is the belt kept busy while a truck is docked? |
| Average rate | items ÷ `RUNNING_LOADED` minutes | exists (`rateCpm`, bay perf) | How fast does this bay load? |
| Peak rate | highest items in any 1-minute bucket per bay per shift | **new** | What is the bay's demonstrated capacity? |
| No-flow intervals | gaps with no item ≥ the finished-gap threshold while a truck is docked; longest and total | **new** (replaces "average gap") | Where did loading stall, and for how long? |

Dropped from the owner's list as display metrics: *first/last item timestamp* and *processing duration* (they are the visit's
`startedAt`/`finishedAt`); *average gap between items* (replaced by no-flow intervals, which answer the same question directly).

### 1.3 Flow runs (the owner's "batches")
A **flow run** is a continuous stretch of product flow on one belt: it opens with the first item after a gap, and closes when no item
crosses for `thresholds.finishedGapMin` (default 3 min, the same rule that sets a visit's `finishedAt`). Runs are created by the
backend automatically and stored in `flow_runs`.

| Field | Example |
|---|---|
| `runId` | `R-20261024-B03-0012` |
| `bay` | `B03` |
| `start`, `end`, `durationSec` | `07:30:12`, `08:15:42`, `2730` |
| `items` by pack and `dir` | cases 1,250 · sacks 120 · out 1,370 · in 0 |
| `distinctSkus`, `damaged` | 12, 8 |
| `avgRate` | 30.1 items/min |
| `visitId`, `assocConf`, `assocStatus` | the visit it belongs to (§3), or `null` with status `UNMATCHED` |
| `status` | `OPEN` / `CLOSED` |

Shown as: **interruptions per visit** (runs − 1), the longest no-flow gap, and in the daily report a run summary. A run with no
visit is *unmatched belt activity* (§3.3).

## 2. Vehicle intelligence

### 2.1 Visit record (dock camera, LPR)
| Field | Status |
|---|---|
| `visitId`, `bay` | exists |
| plate (bn/en) and `plate.conf` | exists |
| `cam` of the first read | **new** (stored) |
| `firstSeenAt`, `lastSeenAt` (camera observations) | **new** (stored; the evidence behind arrival and departure) |
| `arrivedAt`, `dockedAt`, `startedAt`, `finishedAt`, `departedAt` | exist (§4.1 timeline) |
| `phase` | exists (`ARRIVED` … `DEPARTED`), richer than Arrived/Present/Departed |
| agency (transporter) | exists |
| `vehicleKey` | normalised plate, used to recognise repeat visits; **new** (stored) |

**Gate limitation (binding for dhk-depot):** the depot has **no gate camera**. `arrivedAt` is the first DOCK-camera read, so
**queue time and depot dwell (gate in → gate out) cannot be measured** and must not be shown with real data. Only bay-level times are
real: bay occupancy (`departedAt − dockedAt`), time before first item, active loading, time after last item. The mock simulator
models a gate read; the UI already hides "wait before docking" when the value is `null`, and it must stay hidden for real data.
A gate LPR camera is a hardware option for the client (P2).

### 2.2 Core vehicle metrics
| Metric | Status | Question |
|---|---|---|
| Visits handled, per bay | exists | How many trucks did each bay serve? |
| Arrivals and departures per hour | **new** (aggregate) | When do trucks arrive and leave? Do we staff the right hours? |
| Bay occupancy: mean, median, P90, min, max | mean exists; median, P90 and extremes **new** | Is a typical truck fast, and how bad are the slow ones? |
| Per-bay occupancy | exists (bay performance) | Which bays hold trucks longest, against comparable trucks? |
| Concurrent trucks, peak window | **new** | When is the dock congested? |
| Long-stay visits | exists (detention, threshold) | Which trucks overstayed, and was it before, during or after loading? |
| Repeat visits, distinct vehicles | **new** | Which vehicles and transporters come regularly (scorecard)? |
| Unknown or low-confidence plates | exists (`truck.unknown_plate`) | How reliable is the plate data? |

### 2.3 Vehicle analytics (Trucks & Dwell tab, reports)
Arrival and departure pattern by hour; peak congestion window; long-stay list (with the phase where the time went); bay comparison
(through the bay index, §0.6); day-of-week comparison; repeat-visit and transporter analysis (product spec item H). Queue duration and
depot dwell are excluded until a gate camera exists.

## 3. Truck-to-belt association
DepotFlow's most valuable analytics come from tying belt flow to the truck that was being loaded or unloaded.

### 3.1 Rule
1. Same bay.
2. An item belongs to the visit whose window `[dockedAt, departedAt)` contains the item's `ts`.
3. If two windows overlap (the next truck docks before the previous one is recorded as departed) or a departure is missing, the item
   goes to the visit with the most recent `dockedAt` before it, with reduced confidence, and the visit gets an exception status.
4. Items outside every window are **unmatched belt activity**.
5. Association runs live (provisional) and again when the visit closes (final). Final values replace provisional ones; reports use final.

### 3.2 Confidence and exception status (per visit and per flow run)
`assocConf` (0–1) and `assocStatus`:
`OK` · `OVERLAP` (two trucks' windows overlap) · `NO_DEPARTURE` (departure inferred, not observed) · `CLOCK_SKEW` (dock and belt camera
clocks disagree beyond tolerance, §6) · `UNMATCHED` (flow without a truck) · `NO_FLOW` (truck without flow).
Any visit not `OK` shows a small marker in the truck log and is excluded from the bay index.

### 3.3 Per-visit metrics
| Metric | Definition | Status |
|---|---|---|
| Time before first item | `startedAt − dockedAt` | exists (pre-operation) |
| Loading or unloading time | `finishedAt − startedAt` | exists (active) |
| Time after last item | `departedAt − finishedAt` | exists (post-operation) |
| Items, by pack and SKU; damaged items | from associated `belt_items` | exists |
| Throughput | items ÷ active minutes | exists |
| Belt loaded share during the visit | `RUNNING_LOADED` ÷ occupancy | exists |
| Interruptions | flow runs − 1; longest no-flow gap | **new** |
| Reverse items, net count | §1.2 | **new** |
| No-flow share | (occupancy − active) ÷ occupancy | **new**, labelled as observed time without flow, never as "idle" |
| Unmatched visit | visit closed with zero associated items | **new** event `truck.no_flow` |
| Unmatched flow | flow run with no visit | **new** event `belt.flow_without_truck` (also a security signal) |

**Wording rule:** "no product flow observed" is the label. "Idle", "waiting" or "inefficient" are never used for this number, because
the cause may be no active order, staging, a planned pause or something else (§0.2).

## 4. Insights (rule-based, no AI)
Insights are rules over the stored data. Each produces an observation sentence, the evidence (numbers and links into the twin or
events), and optional labelled hypotheses. **Comparable** means the same cohort as the bay index (`docs/03` §4.4: direction × pack ×
volume band).

| Insight | Rule | Baseline |
|---|---|---|
| Unusual truck stay | occupancy > P90 of comparable visits | P90 over the last 30 days; until 30 comparable visits exist, the configured detention threshold |
| Truck processing outlier | active minutes per 100 items > P90 of its cohort | as above |
| Long no-flow at a bay | no-flow gap ≥ threshold while a truck is docked | configured minutes (`thresholds.emptyRunMin` or a new `noFlowMin`) |
| Damage increase | damage rate of a bay or SKU over the last 7 days > 2 × its 30-day rate and ≥ 5 damaged items | 30-day history |
| Reverse movement anomaly | reverse share of a shift > 2 % and ≥ 10 items | configured |
| Bay below comparable throughput | bay index < 85 with confidence `OK` for 3 consecutive days | bay index |
| Highest and lowest bay | by bay index (never raw items/min), confidence `OK` only | bay index |
| Peak arrival hour, congestion window | max arrivals per hour; max concurrent trucks | the period |
| SKU concentration | top SKU's share of items ≥ 30 % | the period |
| Unmatched activity | any `belt.flow_without_truck` or `truck.no_flow` | none |

Numbers above are defaults, admin-configurable. The cold-start rule is binding: no P90-based insight fires before the baseline has
its minimum sample.

## 5. Reports by level
**A. Live (exists):** active trucks, bay status, belt state, live counts, SKU running count, damage detections, no-flow alerts.
Additions: current flow run on the bay inspector ("Run 3 · 18 min"), unmatched-flow alerts.

**B. Shift report (exists, Task 22C).** Additions: split by pack; median and P90 occupancy; longest occupancy; interruptions per
truck and the longest no-flow interval; flow-run summary; reverse items; unmatched visits and unmatched flow; camera coverage.

**C. Daily report (exists).** Additions as in B, plus arrivals and departures by hour, the bay index per bay, damage rate by bay and
by SKU, and comparison with the same weekday over the previous 4 weeks (beside the existing previous-period delta).

**D. Weekly and monthly report (new, Task 26 or later):** throughput, occupancy and bay-index trends; pack and SKU mix; damage trend;
peak hours; transporter and repeat-visit summary; best and worst bays by index; insights fired; data coverage. It needs at least two
full weeks of history before the first issue.

## 6. Data quality and trust (added)
1. **Camera coverage:** per camera and period, the share of time it was `OK`. Every aggregate shows coverage; below 95 % the number is
   marked partial.
2. **Clock sync:** all cameras and servers run NTP from one source. The backend measures dock-to-belt camera skew and marks
   association `CLOCK_SKEW` beyond 2 s.
3. **Late and out-of-order data:** aggregates for a closed shift are recomputed if late records arrive within 24 h; the report shows a
   "revised" marker.
4. **Corrections and audit:** plate corrections, event closes marked "false detection", and manual visit edits are stored with who,
   when and why (`audit_log`). A false-detection close removes the event from rates; the raw record is kept.
5. **Model versions:** each record carries its model version, so a model change can be seen in trends.

## 7. Storage and retention (input to Task 24)
Existing backend tables (`docs/03` §5): `events`, `event_status_log`, `visits`, `counts_1m`, `belt_intervals`, `bay_state_5s`,
`actors_1s`, `people_minutes`, `camera_health`, `roster_assignments`, `employees`, `skus`, `shifts`, `users`, `alert_rules`,
`notifications_log`, `audit_log`.
**New:** `belt_items` (§1.1), `flow_runs` (§1.3), visit association fields (§3.2), `vehicles` (normalised plate, first and last seen,
visit count), hourly and daily continuous aggregates for the new metrics.

### 7.1 Platform, auth and admin tables (built in Task 24, used by Task 23)
The RBAC permission matrix stays in code (`src/lib/rbac.ts` and its server twin), so roles are an enum, not a table. The tables hold
who the users are, where they may work, their sessions, and the configuration the admin pages edit.

| Table | Key columns | Notes |
|---|---|---|
| `sites` | `site_id`, name (en/bn), timezone, business-day start | one row today (`dhk-depot`) |
| `site_settings` | `site_id`, `show_captain_names`, thresholds (detention, idle, crowding, empty-run, finished-gap, no-flow) | the admin "thresholds" page |
| `bays` | `site_id`, `bay`, label, door index, direction mode (`AUTO`/`INBOUND`/`OUTBOUND`), active | |
| `cameras` | `cam`, `site_id`, `bay`, role (`DOCK`/`CREW`/`BELT`), stream URL, active | stream URLs are admin-only |
| `shifts` | `site_id`, code, start, end, active-from | exists in `docs/03` §5; versioned so old reports keep their shift boundaries |
| `users` | `user_id`, username, display name, `password_hash` (argon2id), `role` (`HQ_VIEWER`/`DC_MANAGER`/`SHIFT_SUPERVISOR`/`SECURITY`/`ADMIN`/`KIOSK`), active, `must_change_password`, created, last login | no email: the server is offline, the admin resets passwords |
| `user_sites` | `user_id`, `site_id` | a user has one role plus a list of sites (product spec §2) |
| `user_prefs` | `user_id`, language, digits (Latin/Bangla), theme | the server copy of the per-user preferences |
| `sessions` | `session_id`, `user_id`, created, expires, last seen, revoked, user agent, IP | backs the JWT httpOnly cookie (`docs/03` §4); revocable from the admin page |
| `login_attempts` | username, IP, time, success | lockout after repeated failures |
| `kiosk_devices` | `device_id`, `site_id`, label, token hash, last seen, revoked | the video-wall PC signs in with a device token, not a password |
| `telegram_targets` | `site_id`, chat ID, label, role group, active | used by `alert_rules` |
| `alert_rules`, `notifications_log` | as in `docs/03` §5 | |
| `employees`, `roster_assignments`, `skus` | as in `docs/03` §5 | roster changes mid-shift are logged |
| `audit_log` | who, when, action, entity, before and after (JSON), IP | every admin change, sign-in, role change, plate correction and event edit |

Retention for this group: indefinite, except `sessions` and `login_attempts` (90 days).

### 7.2 Retention
Retention (owner decision 2026-11-06: at least 12 months of visits, dwell, cartons/min, events and evidence, with event edits logged):
| Data | Retention |
|---|---|
| visits, belt_items, flow_runs, belt_intervals, events, audit and status logs | ≥ 12 months |
| aggregates (hourly, daily) | indefinite |
| snapshots (evidence images) | ≥ 12 months |
| clips (evidence video) | owner decision (§10); clips dominate disk use |
| `bay_state_5s`, `actors_1s` (replay) | owner decision (§10) |

Size estimate, to be checked against real volume: at about 10,000 items a day, `belt_items` grows by roughly 4 million rows a year.
That is small for PostgreSQL/TimescaleDB on one server. Disk use is driven by evidence clips and the replay tables, not by counts.

## 8. Contract rev 1.4 candidates (additive)
- `CaseTick.objId` (optional).
- `BayState.visit.assoc: { conf, status }` and the same on `Visit` (REST).
- New events: `truck.no_flow` (warn), `belt.flow_without_truck` (warn; security may raise it).
- Report: full per-group open-alert counts for the handover (gap found in Task 22.9).
- Analytics endpoints: trucks and dwell distribution (median, P90, by hour), flow runs per visit, damage rate by bay and SKU.

## 9. Changes from the owner's draft
1. *Point* → **bay**; *batch* → **flow run** (name clash with manufacturing lots); Box → `CASE`, and `SHRINK` added as a pack type.
2. Mapped every item to what the contract already has; about half already exists under other names.
3. Damage rate uses the same pack as denominator and covers all four hygiene flags, not only damaged boxes.
4. Forward/Reverse is defined against the visit's direction (`OUT`/`IN`), so it means rework or a counting fault, not belt direction.
5. Dropped as display metrics: first/last item time, processing duration (duplicates of the visit timeline) and average gap
   (replaced by no-flow intervals). Distinct SKUs kept as context only.
6. Queue and depot dwell stated as **not measurable** at dhk-depot without a gate camera.
7. Throughput rankings use the normalised bay index, never raw items per minute; people are never ranked.
8. P90 rules get a cold-start minimum. Damage alerts get a minimum count, so 1 damaged item out of 10 does not fire.
9. Added data quality (coverage, clock sync, late data, corrections and audit, model versions) and storage and retention.
10. "Idle ratio" is renamed **no-flow share** and always labelled as an observation.

## 10. Open decisions for the owner
1. **Task 24 is built here with Claude Code** (owner decision 2026-11-09, sequence above), as a server next to the frontend: ingest
   from NATS into TimescaleDB, the REST API of `docs/03` §4, and the tables of §7 and §7.1. Assumption to confirm: the DeepStream side
   already publishes the `docs/03` NATS subjects (`BayState`, `CaseTick`, `WhEvent`, `HealthFrame`), so Task 24 consumes and stores
   them and does not build the state-engine.
2. **Gate camera:** offer the client a gate LPR camera so queue time and depot dwell become real (P2), or leave them out?
3. **Clip retention** (for example 90 days) and **replay retention** (for example 30 days), given disk size on the on-prem server.
4. **Flow run** as the name in the UI (EN) and its Bangla term.
5. **Weekly and monthly report** priority (needs two weeks of real data first).
