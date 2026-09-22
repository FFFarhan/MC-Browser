# Performance Specification

## Targets

On a representative current desktop or mid-range laptop:

- Default render distance: 8 chunks
- Configurable range: 4–16 chunks
- Target: 60 rendered frames per second
- Minimum sustained playability: 30 frames per second
- 95th-percentile main-thread frame time at default settings: below 20 ms during steady traversal
- No single normal generation or meshing task on the main thread above 4 ms
- No unbounded memory growth after travelling outward and returning
- Total memory target: below 1.5 GB at 16-chunk distance
- Default-setting resident chunk and GPU memory reach a steady-state plateau during a 20-minute traversal test
- Input-to-next-frame response remains below 100 ms at the 95th percentile during ordinary streaming

These are measured targets, not reasons to hide correctness defects. Lower graphics settings must provide a recovery path.

## Budgets and bounds

- Worker count derives from hardware concurrency but is clamped to 1–4.
- Generation, meshing, lighting, water, and persistence queues have explicit maximum sizes.
- Stale queued work is cancelled before new work is added.
- Per-frame chunk attachments, lighting updates, water updates, and particle creation are budgeted.
- Dropped items and particles have distance and count caps.
- Persistence encoding and commits are coalesced and never run more than one save per world concurrently.
- Main-thread chunk attachment and disposal use separate budgets so dense-area entry cannot monopolize a frame.
- Overload reduces distant generation and cosmetic work before affecting collision-safe chunks near the player.

Every bound is a named configuration constant with a production default, safe minimum and maximum, and diagnostics counter. A queue may reject, replace, postpone, or degrade work; it may never grow silently.

## Hot-path rules

- Avoid per-frame allocation in voxel collision, ray traversal, and chunk visibility checks.
- Use typed arrays for dense voxel, light, and mesh data.
- Cache registry lookups needed inside inner loops.
- Do not clone entire chunks for a single mutation.
- Remesh only chunks affected by block, light, liquid, or neighbor-border changes.
- Keep large world positions out of `Float32` render attributes by rebasing around the player.
- Pool only objects proven hot by profiling; every pool has a maximum retained size.
- Avoid GPU readback during normal gameplay.

## Diagnostics

The F3 overlay reports FPS, current, 95th-, and 99th-percentile frame time, long-frame count, input-latency estimate, coordinates, floating-origin offset, current chunk, seed, visible and resident chunk counts, queue capacities and sizes, stale-result count, worker utilization and restarts, triangles, draw calls, generation and meshing timings, save duration, mutation count, GPU-resource counts, and available heap information.

## Benchmarks

Automated deterministic benchmarks cover generation, visible-face meshing, greedy meshing, lighting propagation, collision sweeps, and save encoding. A Playwright traversal scenario records frame and queue metrics. CI detects gross regressions using generous stable thresholds; final release profiling occurs in a real browser without development tooling overhead.

Release profiling includes idle, steady traversal, sprinting across new terrain, rapid edits on a chunk corner, lighting removal, water propagation, inventory use, save commit, origin rebase, and a 20-minute out-and-back soak. Measurements record device and browser details and compare against a checked-in baseline report.
