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
  a few waiting trucks, painted guide lines. No road, trees, neighbouring buildings or gate in the default view
  (`view.showExteriorContext` = false; kept in config for later).
- The reference video's style (soft palette, floating pins, pill labels, clickable everything) is applied **to the interior**.

## 1. Look and feel
- **Camera:** perspective, FOV 30°. Default = `Floor overview`: positioned **north of the shed interior, high, looking south** at the
  dock wall so all 7 belts, the crews, staging and the truck rears are in frame (≈ 55° elevation, slight east offset).
  OrbitControls with damping; polar 20°–80°; pan bounded to the shed footprint + apron; zoom 10–120 m.
- **Palette, materials, lighting and geometry quality: `docs/06-visual-language.md` is binding** (pale periwinkle/white world, saturated brand blue, rounded geometry, AO). The real floor is green epoxy, but the twin follows the reference look by the user's decision.
- **Lighting:** per docs/06 §2 (Lightformer environment, soft key light, AO on High/Med, PBR Neutral tone mapping).
- **Tokens and dark theme:** docs/06 §1.
- Selection: blue outline + floor ring; hover: lighter outline. Pins: rounded map-pin sprites, colour by severity, gently bobbing;
  pill label beside selected objects (`B04 · DHAKA METRO-DA 11-2171 · Loading 412`).

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

- **Belt animation:** belt UV scroll ∝ `rateCpm`; items spawned per `CaseTick` travel boom tip ↔ belt mouth in `dir`; colour by SKU;
  flagged items red with a small pin; `SACK` pillow mesh, `CASE` box, `SHRINK` wrapped block. Representative, not physically exact.
- Boom extends over 4 s when a visit enters `DOCKED`, retracts after `FINISHED`.
- Each bay's interior is a selectable group: clicking floor, belt, staging or crew opens the matching inspector.

## 4. Actors
- **Truck (Bangladesh covered van):** box body ~7.5 × 2.4 × 3.2 m with cab; liveries randomised (yellow/blue, blue/yellow, green, teal),
  faded hand-painted feel (canvas, no real company names); green rear plate with Bangla text via **DOM `Html`** (troika can't shape Bengali).
  States: `waiting` (apron holding slot), `reversing` (6–8 s ease to the door), `docked`, `departing` (drives out of the apron strip and fades).
- **Person:** low-poly capsule (1.7 m); **captain = full hi-vis vest** (lime `#C8F03C`, silver bands) + dark handheld scanner;
  **worker = cross-strap (X) vest**; forklift operator seated. Animations: HANDLING, SCANNING, WALKING, STATIONARY, CARRYING, DRIVING.
  PPE violation → amber ring at feet. **No** phone or idle visuals (contract §2).
- **Forklift:** yellow counterbalance forklift with mast and forks; carries a pallet when `act=CARRYING`.
- Interpolate positions/heading between frames; fade out actors unseen for 5 s.

## 5. Status encoding
| Object | Encoding |
|---|---|
| Bay | floor plate at the belt mouth tinted by belt status: `RUNNING_LOADED` → `--status-ok`, `RUNNING_EMPTY` → `--status-warn`, `STOPPED` → `--status-neutral`, `NO_TRUCK` → `--status-idle`, `OFFLINE` → `--status-offline` + hatch; open critical event pulses `--status-critical` |
| Belt | emissive strip along the frame, same colours |
| Door | shutter open/closed |
| Camera | small camera glyphs at mount positions; red with a slash when offline |
| Event | pin above `pos` (or above the bay) for open warn/critical events; click → inspector with evidence |
| Staging | pallet count = `palletsWaiting`; amber glow if `oldestWaitSec` > threshold |

## 6. Camera presets (800 ms eased fly-to)
`Floor overview` (default; looking south, so B07 (east) appears on the left and B01 on the right) · `Dock wall` (low, from inside looking at all 7 doors) · `Bay n` (close over the belt mouth, looking at the door,
truck rear visible through it) · `Staging & aisle` · `Apron` (from inside over the dock wall, looking at docked/waiting trucks).
Tray rows and search results fly to the object.

## 7. Wall mode
Cycle: Floor overview (with KPIs) 30 s → each active bay 15 s → Alerts board 20 s. Big pill labels, no hover UI.

## 8. Multi-site
Other DCs/depots get their own `config/sites/{id}.json` (footprint, dock faces (any of N/E/S/W, several allowed), bay list, interior zones,
`view` block). The scene builder must not assume one dock face, seven bays, or that exterior context exists.
