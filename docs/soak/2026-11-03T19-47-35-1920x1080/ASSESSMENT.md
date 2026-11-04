# Assessment of this run (written by the architect session, 2026-11-04)

`summary.md` says FAIL. That verdict comes from the harness, not from a leak. Read this note first.

## How much of the run is valid
| Window (hours since start) | Samples | State |
|---|---|---|
| 0.00 to 0.16 | 19 | Valid (this is the 10 minute warm-up) |
| 0.16 to 1.22 | 111 | Invalid for timing: median 1 fps, GPU 990 ms. The Claude desktop app was the foreground process (112 samples), so Windows throttled the test browser |
| 1.22 to 6.30 | 0 | No samples for 305 minutes (machine asleep or the process suspended) |
| 6.30 to 8.12 | 219 | Valid, about 1.8 h at 1x, about 161 fps, p95 12.2 ms |
The 60x phase never ran (the run was stopped with Ctrl+C at 8.12 h of a 12 h plan). The alert store peaked at 360 of its 500 cap.

## What the data does show
- Heap after GC 24.6 to 26.8 MB (0.18 MB/h); textures 47 flat; DOM nodes and listeners flat; no errors, no lost context, no non-local request, no tier step.
- 163 simulated user actions, 0 failed.
- Geometries: constant at 164 until 6.35 h, then alternating 164 and 169 about every 6 minutes (draw calls 384 and 401 in step), 12 times back to the baseline of 164.
  That is a bounded cycle (a vehicle-sized group of meshes entering and leaving the scene), not growth. The "geometries flat" check compares the peak of the
  last third with the first third, so it fails when the scene toggles between two stable states. The harness criterion is too strict; see BACKLOG.
- The "fps drop -16290 %" line is meaningless: its first window is the throttled 1 fps window.

## What this run does NOT prove
- That the alert store's heap plateaus once its 500 cap is reached (never reached), and anything at 60x.
- Anything about the KPI popovers (the simulated user never opens one) or the Performance tab (not built yet).

## Decision
Accepted as sufficient browser-side evidence for now (together with `t17-60min`). The cap-plateau check is replaced by a shorter 60x-weighted run
after Task 20, with the harness fixes listed in BACKLOG.
