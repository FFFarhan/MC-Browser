# Architecture Specification

## Purpose

The project is a static, client-side TypeScript application that combines a deterministic voxel simulation with Three.js rendering. Game rules must remain usable without the renderer so that world generation, physics, inventory, crafting, lighting, and persistence can be tested deterministically.

## Technology baseline

- TypeScript with strict mode
- Vite
- Three.js
- Vitest
- Playwright
- IndexedDB through a small repository-owned adapter
- Web Workers using ES module workers
- Canvas 2D for procedural texture generation
- Web Audio API for sound

Dependency versions are locked by the package lock created in M0. Avoid runtime dependencies when a small, well-tested repository-owned module is sufficient.

## Runtime ownership

### Main thread

The main thread owns input, the fixed-step simulation, player physics, authoritative loaded chunk state, block mutations, UI, audio, and Three.js resources. It schedules worker jobs and accepts results only when their world ID, chunk coordinate, generator version, and revision match current state.

### Workers

Workers perform deterministic terrain generation and chunk meshing. Inputs and outputs must be serializable records using typed arrays and transferable buffers. Workers do not access IndexedDB, the DOM, Three.js, or mutable main-thread objects.

## Simulation timing

Rendering uses `requestAnimationFrame`. Gameplay uses a fixed 60 Hz simulation step with accumulated real time, a maximum of five catch-up steps per rendered frame, and clamped elapsed time after tab suspension. Pausing stops world simulation while UI rendering continues.

## Coordinate model

- World blocks use signed integer `(x, y, z)` coordinates.
- A chunk covers 16 blocks on X, 192 on Y, and 16 on Z.
- Valid Y values are `0..191`.
- Horizontal chunk coordinates use mathematical floor division.
- Local X and Z are always `0..15`, including for negative world positions.
- Y outside the world range reads as air above and an immutable boundary below.

## Major modules

```text
src/
├── app/             startup, lifecycle, error boundary
├── engine/          loop, clocks, events, input
├── world/           chunks, coordinates, block access, streaming
├── generation/      seeds, noise, biomes, caves, features
├── meshing/         face rules, greedy meshing, mesh buffers
├── rendering/       Three.js scene, materials, chunk views, effects
├── physics/         AABB collision and voxel ray traversal
├── player/          state, controller, survival rules
├── items/           items, stacks, tools, drops
├── crafting/        recipe registry and matching
├── lighting/        sunlight and block-light propagation
├── fluids/          bounded water update queue
├── persistence/     IndexedDB schema, repositories, migrations
├── audio/           procedural sound and audio routing
├── ui/              menus, HUD, inventory, settings
├── workers/         generation and meshing worker entry points
└── diagnostics/     metrics, debug overlay, benchmarks
```

Each folder exposes a deliberate public barrel only where useful. No subsystem may import UI or rendering code to implement game rules.

## Chunk lifecycle

```text
absent → queued → generating → generated → meshing → ready → visible
   ↑                    ↓           ↓          ↓          │
   └──────────────── invalidated / unloaded ──────────────┘
```

The chunk manager calculates a desired set around the player's current chunk. Jobs use distance and forward-motion priority. A bounded queue prevents outdated work from growing without limit. Neighbor availability and mutation revisions determine whether a mesh result is current.

## Error handling

- Startup failures show a readable recovery screen.
- Worker failures reject the job, restart the worker within a bounded retry policy, and retain authoritative state.
- Persistence writes use transactions and never replace the last valid world record with a partially encoded value.
- Unsupported or corrupt saves produce a diagnostic message and preserve the original data for export.
- Audio failure is non-fatal.
- WebGL context loss pauses rendering and attempts a bounded restoration.

## Security and privacy

The release has no accounts, analytics, network gameplay, or required remote services. Imported saves are untrusted data and must be size-limited, schema-validated, and rejected on invalid fields before IndexedDB writes.
