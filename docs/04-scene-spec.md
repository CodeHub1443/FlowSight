# 04 — 3D Scene Spec (interior-first)

References: `docs/reference/video/*.jpg` and `docs/reference/ui-ref-*.jpg` (style only), `cam-*.jpg|png` (what the inside of a bay
really looks like: **primary layout reference**), `site-satellite.jpg` (footprint only).
All geometry is driven by `config/sites/dhk-depot.json`. **Approximate dimensions** come from satellite imagery and camera frames and
must be verified on site (they are config, so fixing them is a data edit).

## 0. Focus: the inside of the shed (binding)
The depot has almost nothing to see outside. Trucks reverse up to the dock doors; **~90% of each telescopic conveyor and every
activity (belts, crews, staging, crates, forklifts) is inside the shed.** The twin is therefore a **roofless "dollhouse" cutaway of
the shed interior**:
- The roof is never rendered in the default view; the N, E and W walls are cut to a low **cutaway height** (config `view.cutawayWallHeight`, 2 m)
  so the camera always sees the floor. The dock (S) wall is rendered full height only as a thin band above the doors so the doors read clearly.
- Outside the dock wall only a **narrow apron strip** is rendered (config `view.apronDepth`, 12 m): truck rear halves at the doors,
  a few waiting trucks, painted guide lines. Around it a ring road with trees (`view.surround`, docs/06 section 7.5; user decision, Task 13). No neighbouring
  buildings or gate in the default view (`view.showExteriorContext` = false; kept in config for later).
- The reference video's style (soft palette, floating pins, pill labels, clickable everything) is applied **to the interior**.

## 1. Look and feel
- **Camera:** perspective, FOV 28°. Default = `Floor overview`: the **diagonal hero view of docs/06 D1**, from inside-north-east looking
  south-west (40° elevation, 35° azimuth off the dock-wall normal), so the dock wall recedes along the diagonal with all 7 belts, the crews
  and staging in frame, B07 nearest on the left and B01 furthest on the right. The former straight-on view is the preset `Plan`.
  OrbitControls with damping; polar 20°–80°; pan bounded to the shed footprint + apron; zoom 10–120 m.
- **Palette, materials, lighting and geometry quality: `docs/06-visual-language.md` is binding** (pale periwinkle/white world, saturated brand blue, rounded geometry, AO). The real floor is green epoxy, but the twin follows the reference look by the user's decision.
- **Lighting:** per docs/06 §2 (Lightformer environment, soft key light, AO on High/Med, PBR Neutral tone mapping).
- **Tokens and dark theme:** docs/06 §1.
- Selection: blue outline + floor ring; hover: lighter outline. Pins: rounded map-pin sprites, colour by severity, gently bobbing;
  pill label beside selected objects (`B04 · DHAKA METRO-DA 11-2171 · Loading 412`).
- **Picking and hover (Task 22B; `src/scene/interaction/`).** Trucks, people, forklifts and camera glyphs are selectable. They are instances in
  shared pools and take no pointer events of their own, so there are **no R3F pointer handlers on them**: one canvas-level handler casts a ray
  on a click and tests it against the bounds of what is drawn now (a capsule per person, forklift and truck; a sphere per glyph; built from the
  rig's current poses, including the crew-separation offset; an actor still fading in or out is skipped). The bound grows with distance (at least
  0.006 rad) so a figure at the hero distance can still be hit. **The nearest hit wins**, and **an actor beats the bay floor plate under it**: a click
  that hits claims the event, so R3F's bay handler never sees it. A click on nothing of ours reaches R3F and the bays (bays, belts and staging
  stay selectable that way). **A drag never selects anything, anywhere** (t22b.3 Finding A): a pointer movement of more than **4 px between down
  and up is a drag**, not a click, for actors and camera glyphs (the canvas-level handler's own down/up distance) and, independently, for the
  bay/belt/staging R3F click handler (`event.delta`, R3F's own pointer-down-to-click distance) — so a drag that starts on an actor and is declined
  by the actor's own handler does not fall through and select the bay underneath it either. Selection ids are
  the ones the inspector bodies read: the **visit id** for a truck, the **track id** for a person or forklift. **Hover** looks only while the pointer
  moves, **at most 10 times a second**, and never while a button is held (a camera drag); over an actor it shows the pointer cursor and a light
  floor ring (`--hover`), over a camera glyph the cursor only. Cost: one fill of about 100 bounds and one ray test, 1.5 microseconds per ray measured.
- **Selection marker and pill for an actor (B2).** A selected truck, person or forklift gets a blue floor ring (rounded footprint of its kind) and a
  pill above it, both following the actor each frame through refs (no React state). Pill text: truck `B04 · DHAKA METRO-DA 11-2171 · Loading 412`
  (bay, plate, phase and cartons out while loading / in while unloading; in Bangla the Bangla plate and Bangla digits; a truck still waiting on the
  apron shows bay and plate only); person `Captain` or `Worker` (`Person` when the role is unknown), the role only, never a name or an id;
  forklift `Forklift · B04`. When the actor is in the scene the bay is not marked as well (the actor's marker replaces the bay brackets and pill);
  a selection the scene cannot find (a departed visit) falls back to marking its bay, as for any selection. Words: `scene` namespace, `actor.*`.

## 2. Shed and site frame
### 2.1 Frames and transforms (authoritative)
- **Site frame = three.js world:** `X` east, `Y` up, `Z` south, origin at the shed footprint centre at **yard grade** (Y = 0).
- **Bay-local frame** (contract §0): `x` right when facing the door from the yard, `y` into the building, `z` up, origin at the
  door centre at **dock floor level** (`building.floorLevel`, 1.2 m above yard grade).
- For a bay on dock face `S` at door centre `(Xd, Zd)`: `X = Xd + x`, `Z = Zd − y`, `Y = floorLevel + z`
  (inside; the apron and trucks sit at Y = 0, actors with `y < 0` are placed at yard grade).
  Other faces: N: `X = Xd − x, Z = Zd + y`; E: `X = Xd − y, Z = Zd − x`; W: `X = Xd + y, Z = Zd + x`.
  Implement once in `src/scene/site/transforms.ts` with unit tests for all four faces.
- **Heading:** contract `h` (0 = +y, CCW+) → three.js `rotation.y` = `faceYaw + h`, `faceYaw` = 0 S, π N, +π/2 E, −π/2 W (derived from the position formulas above; verified by `transforms.test.ts`).
- **Config `cameraTemplate.mount`** uses the bay-local frame with `z` = height above dock floor.

### 2.2 Shed
- Footprint ~54 m (E–W) × ~76 m (N–S), floor at +1.2 m (dock height). Cutaway walls N/E/W at `cutawayWallHeight`; columns on a ~12 m grid
  (thin grey, instanced) so the space reads as a real shed.
- **Dock wall (S):** 7 door openings, pitch from config (6.5 m, **unverified: may be tighter**), door 3.2 × 3.8 m, roller shutter (open/closed),
  dock leveller plate, rubber seal, door number plate `B01`…`B07` (W→E). A thin blue/white stripe band above the doors stands in for the facade.
- **Apron (outside S):** `apronDepth` deep, yellow guide lines per door, truck rear halves docked; 2–4 holding slots at the apron edge for waiting trucks.

## 3. Bay interior (the main stage; repeat per bay; bay-local frame)
| Zone | Bay-local extent | Content |
|---|---|---|
| Truck (outside) | y −9.5 … −0.2 | truck reversed to the door, rear doors open; only the rear ~5 m is inside the apron strip |
| Telescopic conveyor | fixed body y = `fixedFrom` … `fixedTo` (0.5 … 9); boom tip from y = 0.5 (retracted) to y = −`boomMaxReach` (−7.5, into the truck) | blue frame, dark belt, stainless side guides, grey control cabinets labelled `Conveyor-0n`, yellow motor housing, telescopic sections visible |
| Belt mouth / work zone | y 7 … 9, x −3 … 3 | captain and workers handle items here |
| Staging | y 9 … 16, x −3 … 3 | 2–6 plastic pallets (blue/yellow/orange, some marked FG/DC), crate stacks, cartons or white sacks on pallets |
| Forklift aisle | y 16 … 20 (shared) | forklifts travel E–W; painted aisle lines |
| Storage | y 20 … 70 | instanced blocks of palletised cartons (as in the overhead frames), with aisles; low detail, not interactive |

- **Belt animation:** items spawned per `CaseTick` travel boom tip ↔ belt mouth in `dir`; colour by SKU;
  flagged items red with a small pin; `SACK` pillow mesh, `CASE` box, `SHRINK` wrapped block. Representative, not physically exact.
- **Belt surface scroll (Task 22B, B4).** The cross ticks of the belt move along it at the **same speed the items travel**, one function for both
  (`beltSpeedFor(rateCpm)` in `actors/beltItems.ts`): proportional to the rate up to 6 cartons a minute, then the full 0.9 m/s (a real belt runs at
  one speed; the rate only says how often a carton is put on it), never below a quarter of that while the belt moves, so a trickle still carries its
  first cartons off. The surface is **still when the belt is stopped, empty (`RUNNING_EMPTY`), without a truck, offline, without a rate or of unknown
  direction**. `OUT` runs towards the truck, `IN` towards the mouth. The ticks wrap round the housing belt; the boom sections' belts do not scroll.
  The bay animation runs in the actor layer's frame loop (`bay/bayAnim.ts`); nothing is React state. Not animated on the Low tier.
- **Boom (B3).** The tip runs from `y = fixedFrom` (retracted) to `y = -reach` and back, eased over **1.2 s**. It is **out while a truck stands at the
  door with its rear doors open (visit `DOCKED`, `LOADING`, `UNLOADING`, `FINISHED`)** and **in while the truck is reversing, departing, waiting or
  absent**. `reach` is scaled to the truck's cargo depth (`0.9 x` the 7.4 m van body) and **never past `boomMaxReach`**. The three nested sections slide
  out together (the tip all of the run-out, the next two thirds, the one at the housing a third) and stay joined at every point of the run; the items'
  trip starts at the moving tip. Contact shadows are refreshed once the boom and the shutter come to rest.
- **Door shutter (B5).** The curtain rolls up into its hood over **0.8 s**: open while a truck is docked, or reversing or departing with its rear within
  12 m of the door; closed otherwise (waiting trucks do not open it). Without a live feed (the dev preview) the shutter keeps the `doorOpen` state it
  was given.
- **Camera glyphs (B6).** See section 5.
- Each bay's interior is a selectable group: clicking floor, belt, staging or crew opens the matching inspector.

## 4. Actors
- **Truck (Bangladesh covered van):** box body ~7.5 × 2.4 × 3.2 m with cab; liveries randomised (yellow/blue, blue/yellow, green, teal),
  faded hand-painted feel (canvas, no real company names); green rear plate with Bangla text via **DOM `Html`** (troika can't shape Bengali).
  States: `waiting` (apron holding slot), `reversing` (6–8 s ease to the door), `docked`, `departing` (drives out of the apron strip and fades).
- **Person:** low-poly capsule (1.7 m); **captain = full hi-vis vest** (lime `#C8F03C`, silver bands) + dark handheld scanner;
  **worker = cross-strap (X) vest**; forklift operator seated. Animations: HANDLING, SCANNING, WALKING, STATIONARY, CARRYING, DRIVING.
  PPE violation → amber ring at feet. **No** phone or idle visuals (contract §2).
- **Crew separation (Task 22B, B7).** Two crew figures the camera model reports on top of each other are **drawn apart**: a minimum centre distance of
  **0.55 m**, each drawn at most **0.6 m from its reported position**, per bay (spatial hash, a few relaxation passes), **visual only**: the data, the
  interpolation and the obstacle push are untouched, and the offset is dropped for a figure it would put into a prop. Deterministic (same positions,
  same offsets; a pair exactly on one spot parts along a direction taken from the two track seeds). Forklifts are not moved. Measured cost: about
  0.04 ms a frame for 40 figures (budget 0.2 ms).
- **Forklift:** yellow counterbalance forklift with mast and forks; carries a pallet when `act=CARRYING`.
- Interpolate positions/heading between frames; fade out actors unseen for 5 s.

## 5. Status encoding
| Object | Encoding |
|---|---|
| Bay | floor plate at the belt mouth tinted by belt status: `RUNNING_LOADED` → `--status-ok`, `RUNNING_EMPTY` → `--status-warn`, `STOPPED` → `--status-neutral`, `NO_TRUCK` → `--status-idle`, `OFFLINE` → `--status-offline` + hatch; open critical event pulses `--status-critical` |
| Belt | emissive strip along the frame, same colours |
| Door | shutter open/closed |
| Camera | camera glyph at each configured mount (3 per bay, 21 in all), one instanced mesh. **Shown in X-ray mode (`uiStore.xray`) and always when the camera is not `OK`** (`HealthFrame.cams`; a camera not yet reported is taken as healthy). Tint: `OBSTRUCTED`, `DEFOCUS`, `MOVED` = `--status-warn`; `OFFLINE` = `--status-critical` with a slow (2.4 s) size pulse, **off under `prefers-reduced-motion`**. A click selects the **newest open event of that camera** (`kind: 'event'`; events the role may not see are skipped), or nothing |
| Event | pin above `pos` (or above the bay) for open warn/critical events; click → inspector with evidence |
| Staging | pallet count = `palletsWaiting`; amber glow if `oldestWaitSec` > threshold |

## 6. Camera presets (800 ms eased fly-to)
`Floor overview` (default; looking south, so B07 (east) appears on the left and B01 on the right) · `Dock wall` (low, from inside looking at all 7 doors) · `Bay n` (close over the belt mouth, looking at the door,
truck rear visible through it) · `Staging & aisle` · `Apron` (from inside over the dock wall, looking at docked/waiting trucks).
Tray rows and search results fly to the object.

**Keyboard (`src/scene/camera/keyboardPan.ts`, in `CameraRig`):** presets and limits are unchanged; the keys only move the view inside them.
- Arrow keys pan over the floor relative to the view: Left and Right across it, Up away from the viewer, Down towards the viewer. The view moves, so the scene slides the other way on screen.
  Speed is 0.2 m/s per metre of camera distance (about 22% of the view width per second at any zoom, about 18 m/s at the default view), Shift ×3. Hold moves continuously; release stops with the OrbitControls decay (0.09 per frame at 60 fps, as a decay in time, so frame rate does not change the distance).
- `+` and `-` zoom while held, within 10–120 m. Shift+arrow is the faster pan, so it does not orbit or tilt; the map-control buttons and the mouse do that.
- The pan limit (footprint + apron + 4 m) is applied before each step: pressed against an edge the view rests or slides along it.
- The keys belong to the camera only when focus is on the page or in the scene region (`data-scene-keys`, focusable by Tab or click, focus ring for the keyboard). Inputs, the search box, tray, inspector, top bar, dialogs and popovers keep theirs, as does a panel just clicked with focus left on the page (Chrome scrolls it). Ctrl, Alt and Meta always pass through. `preventDefault` only when a key is consumed.
- A fly-to or map-control step stops key motion until it ends. A key still held then takes over. A preset or Home lands exactly on its pose.

## 7. Wall mode
Cycle: Floor overview (with KPIs) 30 s → each active bay 15 s → Alerts board 20 s. Big pill labels, no hover UI.

## 8. Multi-site
Other DCs/depots get their own `config/sites/{id}.json` (footprint, dock faces (any of N/E/S/W, several allowed), bay list, interior zones,
`view` block). The scene builder must not assume one dock face, seven bays, or that exterior context exists.
