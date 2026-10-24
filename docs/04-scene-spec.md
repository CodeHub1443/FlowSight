# 04 — 3D Scene Spec

References: `docs/reference/ui-ref-*.jpg` (style), `site-satellite.jpg` (layout), `cam-*.jpg|png` (what bays look like inside).
All geometry is driven by `config/sites/dhk-depot.json`. **Approximate dimensions** come from satellite imagery and
must be verified on site (they are config, so fixing them is a data edit).

## 1. Look and feel (match the reference video)
- **Isometric-feeling perspective camera**: FOV 30°, default orbit at ~45° elevation, ~35° azimuth from south-east.
  OrbitControls with damping; clamp polar angle 20°–75°; pan bounded to the site; zoom 25–220 m.
- **Palette (light theme):** ground `#E8EBF7` (soft periwinkle), yard paving `#DDE1F2`, road `#CBD0E6` with white dashes,
  grass verges `#D7F0DC`, trees: soft mint low-poly spheres `#9FDDB0` on short trunks, building walls white `#F7F8FC`,
  roof `#E3E7F5`, accents brand blue. Matte (`MeshStandardMaterial`, roughness 0.9), no textures except
  logos, plates and stripe patterns (canvas-generated).
- **Lighting:** hemisphere + one directional sun with soft shadows (High tier); light fog to fade the site edge. No SSAO/postprocessing (ADR-10).
- All palette values above exist as CSS tokens (`--scene-ground`, `--scene-yard`, `--scene-road`, `--scene-grass`, `--scene-tree`,
  `--scene-wall`, `--scene-roof`) and are read into `scene/materials.ts`; light and dark values both defined.
- **Dark theme:** ground `#0E1424`, walls `#1A2238`, emissive accents; same geometry.
- Selection: blue outline (drei `Outlines`) + floor ring; hover: lighter outline. Pins: rounded map-pin sprites with an icon, colour by severity,
  gently bobbing; a pill label beside selected objects (`TRK · DHAKA METRO-D 11-2171 · Loading`), as in the reference.

## 2. Site layout (dhk-depot), site frame: x = east, z = south, y = up, metres, origin = building centre

### 2.1 Frames and transforms (authoritative)
- **Site frame = three.js world:** `X` east, `Y` up, `Z` south, origin at the building footprint centre at **yard grade** (Y = 0).
- **Bay-local frame** (contract §0): `x` right when facing the door from the yard, `y` into the building, `z` up, origin at the
  door centre at **dock floor level** (`building.floorLevel`, 1.2 m above yard grade).
- For a bay on dock face `S` at door centre `(Xd, Zd)` in site frame: `X = Xd + x`, `Z = Zd − y`, `Y = floorLevel + z`
  (inside the building; the yard and trucks sit at Y = 0, and actors with `y < 0` are placed at yard grade).
  Other faces rotate the (x, y) pair: N: `X = Xd − x, Z = Zd + y`; E: `X = Xd − y, Z = Zd − x`; W: `X = Xd + y, Z = Zd + x`.
  Implement once in `src/scene/site/transforms.ts` with unit tests for all four faces.
- **Heading:** contract `h` (0 = +y, CCW+) → three.js `rotation.y` = `faceYaw + h`, where `faceYaw` = 0 for S, π for N, −π/2 for E, +π/2 for W.
- **Config `cameraTemplate.mount`** uses the bay-local frame with `z` = height above dock floor.
- **Main shed:** ~54 m (E–W) × ~76 m (N–S) footprint, ~14 m eave height, shallow twin-gable roof (two ridges N–S,
  visible in satellite). Facade on the **south face**: **vertical blue/white stripes** (seen in the Google Maps listing photo,
  not included in `docs/reference/` for licensing reasons). Facade colours in config are **physical paint (site data)**, not brand tokens.
  Name sign on the south face: "Unilever" logo panel (placeholder).
- **Dock face = south face** (assumption, see spec §9). **7 dock doors** centred on the face, pitch **6.5 m**, door 3.2 m wide × 3.8 m high,
  dock level +1.2 m, dock leveller plate, rubber dock seal, door number plate `B01`…`B07` above each door,
  **B01 = west → B07 = east**.
- **Canopy:** continuous along the dock face, 4 m deep, slight blue edge band.
- **Yard (south):** ~20 m deep paved apron with painted bay guide lines (yellow) extending 12 m out from each door; a holding lane
  along the boundary wall for waiting trucks (3–4 slots).
- **Boundary:** white wall with blue sheeting panels (listing photo) along the south edge, **gate** at the south-east, guard booth.
- **Road:** Dhaka City Bypass south of the boundary: 4-lane road strip with dashes and a few ambient vehicles (decorative, optional).
- **Context:** neighbouring large shed to the east (low detail, grey, no interaction); tree belt to the west and north (instanced trees).

## 3. Bay interior (repeat ×7; `x` across, `y` into building, bay-local frame from the contract)
| Zone | Bay-local extent | Content |
|---|---|---|
| Truck (outside) | y −9.5 … −0.2 | truck reversed to the door, rear doors open |
| Telescopic conveyor | fixed body y = `fixedFrom` … `fixedTo` (0.5 … 9); boom tip travels from y = 0.5 (retracted) to y = −`boomMaxReach` (−7.5) | blue frame, dark belt, grey control cabinets (Conveyor-01 … 07 label), yellow motor housing |
| Belt mouth / work zone | y +7 … +9, x −3 … +3 | captain and workers stand here |
| Staging | y +9 … +16, x −3 … +3 | 2–6 pallets (blue plastic, some yellow/orange), stacked crates, cases or white sacks on pallets |
| Forklift aisle | y +16 … +20 (shared across bays) | forklifts travel E–W |
| Storage (decor) | y +20 … +70 | instanced pallet stacks of brown cases in blocks with aisles |

- **X-ray mode:** roof and the upper south wall fade to 10% opacity when the camera is close or x-ray is on, revealing the interior
  (the reference video keeps roofs on; we need the interior because that's where the analytics live).
- **Belt animation:** belt texture UV scroll speed ∝ `rateCpm`; items spawned per `CaseTick` travel along the belt path
  (boom tip ↔ belt mouth) in `dir`; colour by SKU (SKU master colour), flagged items red with a small pin; `SACK` uses a
  pillow mesh, `CASE` a box, `SHRINK` a wrapped block. **Note:** item animation is representative: spacing follows tick timing,
  not exact physical positions.
- Boom extension animates over 4 s when a visit enters `DOCKED` and retracts after `FINISHED`.

## 4. Actors
- **Truck (Bangladesh covered van):** cab + box body ~7.5 m × 2.4 m × 3.2 m; liveries randomised from a set (yellow/blue,
  blue/yellow, green, teal) with faded hand-painted panel feel (canvas texture, no real company names); green rear plate.
  The plate shows Bangla text through **DOM `Html`**, not 3D text: troika SDF text does not shape Bengali conjuncts correctly.
  States: `approaching` (drives in from the gate along a spline), `waiting` (holding lane), `reversing` (to the door, 6–8 s ease),
  `docked`, `departing`. Selected truck shows its pill label and the visit tracker.
- **Person:** low-poly capsule (1.7 m), skin and clothing tones randomised; **captain = full hi-vis vest** (lime `#C8F03C` with
  silver bands) + small dark handheld scanner; **worker = cross-strap (X) harness vest**; forklift operator seated. Activity
  animations: HANDLING (arm swing), SCANNING (arm raised), WALKING (bob), STATIONARY (still), CARRYING, DRIVING. PPE violation
  → small amber ring at feet. The scene has **no** phone or idle visuals (contract §2 privacy rule).
- **Forklift:** yellow counterbalance forklift with mast and forks (reference video style); carries a pallet when `act=CARRYING`.
- Interpolate positions and heading between frames; fade out actors not seen for 5 s.

## 5. Status encoding on the scene
| Object | Encoding |
|---|---|
| Bay | floor plate in front of the door tinted by belt status: `RUNNING_LOADED` → `--status-ok`, `RUNNING_EMPTY` → `--status-warn`, `STOPPED` → `--status-neutral`, `NO_TRUCK` → `--status-idle`, `OFFLINE` → `--status-offline` + hatch. A bay with an open critical event pulses `--status-critical` |
| Belt | emissive strip along the frame, same colours; pulse when critical alert open |
| Door | open/closed shutter animation |
| Camera | small camera glyphs on the walls at camera positions; red with a slash when offline (health) |
| Event | pin above `pos` (or above bay if absent) for open warn/critical events; click → inspector with evidence |
| Staging | stacked pallets count = `palletsWaiting`; amber glow if `oldestWaitSec` > threshold |

## 6. Camera presets (fly-to with 800 ms ease)
`Site` (default overview) · `Dock face` · `Bay n` (close, from yard, x-ray on) · `Interior` (inside looking south at all 7 belts) ·
`Yard & gate`. Clicking a tray row or search result flies to the object.

## 7. Wall mode
Cycle: Site (with KPIs) 30 s → each active bay 15 s → Alerts board 20 s. Big pill labels, no hover UI, auto-x-ray.

## 8. Multi-site
Other DCs and depots get their own `config/sites/{id}.json` (footprint, dock faces (any of N/E/S/W, multiple allowed), bay list,
yard polygon, gate positions, context blocks). The scene builder must not assume one dock face or seven bays.
