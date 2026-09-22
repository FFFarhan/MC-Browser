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

These are measured targets, not reasons to hide correctness defects. Lower graphics settings must provide a recovery path.

## Budgets and bounds

- Worker count derives from hardware concurrency but is clamped to 1–4.
- Generation, meshing, lighting, water, and persistence queues have explicit maximum sizes.
- Stale queued work is cancelled before new work is added.
- Per-frame chunk attachments, lighting updates, water updates, and particle creation are budgeted.
- Dropped items and particles have distance and count caps.

## Hot-path rules

- Avoid per-frame allocation in voxel collision, ray traversal, and chunk visibility checks.
- Use typed arrays for dense voxel, light, and mesh data.
- Cache registry lookups needed inside inner loops.
- Do not clone entire chunks for a single mutation.
- Remesh only chunks affected by block, light, liquid, or neighbor-border changes.

## Diagnostics

The F3 overlay reports FPS, current and 95th-percentile frame time, coordinates, current chunk, seed, visible and resident chunk counts, queue sizes, worker utilization, triangles, draw calls, generation and meshing timings, mutation count, and available heap information.

## Benchmarks

Automated deterministic benchmarks cover generation, visible-face meshing, greedy meshing, lighting propagation, collision sweeps, and save encoding. A Playwright traversal scenario records frame and queue metrics. CI detects gross regressions using generous stable thresholds; final release profiling occurs in a real browser without development tooling overhead.
