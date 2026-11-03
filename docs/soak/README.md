# Soak test of /live

`pnpm soak` runs `/live` in mock mode, in a headed Chrome on the real GPU, with a simulated user, and samples the page
every 30 s. It is not part of `pnpm e2e`. Each run writes one folder here:

| File | What it is |
|---|---|
| `summary.md` | Pass or fail, slopes, fps, every collection's peak, the conditions of the run |
| `chart.png` | Heap, DOM nodes, geometries, textures, fps, p95 frame time, GPU ms and script ms over time |
| `samples.csv` | Every sample: the numbers behind the report |
| `errors.log` | Page errors, console errors, non-local requests |
| `actions.log` | Each action of the simulated user and whether it worked |
| `meta.json` | Commit, GPU, viewport, schedule, start time |

## Overnight run (12 hours)

Plug the machine in, close other heavy apps, and run from a terminal at the repo root:

```
pnpm soak --hours=12
```

That is 10 hours at 1x, then 2 hours at 60x, at 1920x1080. For the video wall size, add `--viewport=3840x2160`.

The script keeps Windows awake, and the display on, for as long as it runs. Leave the Chrome window open and do not minimise
it. Ctrl+C ends the run early and still writes the report.

To report a run, attach the whole `docs/soak/<run>/` folder. If it is too big, `summary.md`, `chart.png` and `errors.log`
are the minimum. Say also whether the machine was on mains power and whether anything else ran on it.

## Options

| Flag | Default | Meaning |
|---|---|---|
| `--hours=N` | 1 | Length; the last sixth runs at 60x |
| `--phases=50m@1,10m@60` | from `--hours` | Explicit schedule |
| `--viewport=WxH` | 1920x1080 | Page size |
| `--seed=N` | 1 | Seed of the simulated user |
| `--quality=auto` | auto | Or `high`, `med`, `low` to pin the tier |
| `--warmup=M` | 10 | Minutes excluded from the slopes |
| `--sample=S` | 30 | Seconds between samples |
| `--gc-every=M` | 5 | Minutes between forced GCs; the heap slope uses the sample right after each |
| `--action-min=S`, `--action-max=S` | 30, 60 | Gap between user actions |
| `--uncapped` | off | No vsync. Hotter, but fps then shows headroom |
| `--out=DIR`, `--no-build` | | Output folder; reuse the last debug build |

`node scripts/soak/report.mjs docs/soak/<run>` rewrites the report from the CSV.

## Pass criteria

- Heap slope below 5 MB/h after the warm-up, from the post-GC samples.
- WebGL geometries and textures flat, DOM nodes and listeners flat. "Flat" means the last third of the run peaks no higher
  than the first third did; DOM nodes and listeners get 5 % of room for what the page shows at that moment.
- Fps drop below 5 % from the first window to the last (an hour each, or a third of the run after warm-up if shorter).
- No tier step after the warm-up, no page or console error, no lost WebGL context, no non-local request.

## Reading a result

- At the default vsync cap, fps stays pinned at the display rate until the frame budget is gone, so a slow decline shows
  first in `gpuMs` and `cpuMs`. Look at those panels too, or use `--uncapped`.
- A laptop can lose fps to heat alone. A drop with flat heap, counts and `cpuMs` points at temperature, not at the app.
- The foreground column holds a process name. A window title is never logged, because it can hold private text.
- The simulator worker's own heap cannot be read from Chrome (`workerHeapMB` is empty). The `sim*` columns count its
  collections instead.
- The mock data is not the backend: this proves the browser side, not the behaviour of live NATS traffic.
