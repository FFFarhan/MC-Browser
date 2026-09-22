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

## Production invariants

These properties are non-negotiable and must be represented by automated tests or development assertions:

1. **One authority:** the main-thread world store is the only authority for loaded game state. Workers return proposals; they never mutate authority.
2. **Revision safety:** every asynchronous result carries world, chunk, generator, content, light, and job revisions. A mismatch makes the result disposable without side effects.
3. **Atomic mutations:** a gameplay action either applies its complete block, inventory, and entity transaction or applies nothing.
4. **Deterministic simulation:** identical seed, initial state, ordered inputs, and tick count produce identical gameplay state independent of frame rate and worker scheduling.
5. **Bounded work:** every queue has a capacity, per-tick budget, cancellation policy, overload metric, and safe degraded behavior.
6. **Bounded residency:** chunks, meshes, drops, particles, decoded saves, and caches have explicit ownership and release rules.
7. **Durable saves:** an interrupted save can lose only the newest uncommitted changes, never the last committed snapshot.
8. **Precision safety:** long-distance travel never feeds large world coordinates directly into GPU transforms or collision calculations.
9. **Recoverable subsystems:** audio, workers, service workers, and WebGL may fail without corrupting world state.
10. **Versioned boundaries:** persistence, worker messages, registries, generation, and exported worlds carry explicit schema versions.

## Runtime ownership

### Main thread

The main thread owns input, the fixed-step simulation, player physics, authoritative loaded chunk state, block mutations, UI, audio, and Three.js resources. It schedules worker jobs and accepts results only when their world ID, chunk coordinate, generator version, and revision match current state.

### Workers

Workers perform deterministic terrain generation and chunk meshing. Inputs and outputs must be serializable records using typed arrays and transferable buffers. Workers do not access IndexedDB, the DOM, Three.js, or mutable main-thread objects.

### State boundaries

- **Domain state:** serializable world, player, inventory, furnace, time, lighting, and fluid state. It has no DOM or Three.js references.
- **Derived state:** meshes, render transforms, UI view models, queue priorities, and diagnostics. It is rebuildable and is never needed to restore a save.
- **Persistent state:** versioned snapshots and mutation records derived from domain state.
- **Transient state:** input edges, interpolation values, particles, sounds, selection, and in-flight jobs. It is safely discarded on reload.

Communication across boundaries uses typed commands and events. UI emits domain commands; domain services return success or a typed rejection. Rendering observes committed domain state and never changes gameplay state directly.

## Simulation timing

Rendering uses `requestAnimationFrame`. Gameplay uses a fixed 60 Hz simulation step with accumulated real time, a maximum of five catch-up steps per rendered frame, and clamped elapsed time after tab suspension. Pausing stops world simulation while UI rendering continues.

Input events are timestamped and consumed at tick boundaries. Rendering interpolates between the previous and current committed simulation states. If simulation falls behind beyond the catch-up limit, excess accumulated time is discarded and counted; the engine never enters an unbounded catch-up spiral. `visibilitychange`, `pagehide`, pointer-lock loss, and WebGL context events have explicit lifecycle handlers.

## Coordinate model

- World blocks use signed integer `(x, y, z)` coordinates.
- A chunk covers 16 blocks on X, 192 on Y, and 16 on Z.
- Valid Y values are `0..191`.
- Horizontal chunk coordinates use mathematical floor division.
- Local X and Z are always `0..15`, including for negative world positions.
- Y outside the world range reads as air above and an immutable boundary below.

World positions are stored as integer chunk coordinates plus local coordinates. Rendering and collision use coordinates relative to a floating origin near the player. Origin rebasing occurs only at a simulation boundary, translates all derived scene objects together, and never changes authoritative block positions, save data, noise inputs, or chunk keys.

## Data layout and keys

Chunk block storage is a flat `Uint16Array` with one documented index formula used by all systems. Sunlight and block light use packed nibbles or an equally bounded typed representation selected and benchmarked in M1. Runtime block flags are registry data, not duplicated per voxel.

Chunk identity uses one collision-free structured key within the supported coordinate range. Ad hoc string keys are prohibited outside the key utility. Map iteration order must never affect simulation results.

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
├── diagnostics/     metrics, debug overlay, benchmarks
├── platform/        feature detection, browser lifecycle, storage quota
└── shared/          versioned worker protocols and stable primitive types
```

Each folder exposes a deliberate public barrel only where useful. No subsystem may import UI or rendering code to implement game rules.

## Chunk residency and lifecycle

```text
absent → queued → generating → generated → meshing → ready → visible
   ↑                    ↓           ↓          ↓          │
   └──────────────── invalidated / unloaded ──────────────┘
```

The chunk manager calculates a desired set around the player's current chunk. Jobs use distance and forward-motion priority. A bounded queue prevents outdated work from growing without limit. Neighbor availability and mutation revisions determine whether a mesh result is current.

Chunks have independent residency flags for domain data, lighting, mesh buffers, GPU objects, and persistence dirtiness. Losing visibility does not destroy dirty domain state. Eviction proceeds in order: detach the GPU object, dispose GPU resources, release mesh buffers, persist dirty mutations, then release domain arrays. Chunks containing the player, an active transaction, or an unfinished required save are pinned.

Meshing jobs receive an immutable center-chunk snapshot plus a one-block neighbor halo and the relevant revision tuple. Missing neighbors follow an explicit provisional-border policy; when a neighbor arrives, both sides are invalidated once. A chunk never reads a neighbor array while that array can be transferred or released.

## Command and mutation pipeline

Gameplay changes use two phases:

1. Validate against one committed tick state, including reach, block rules, collision, inventory capacity, and loaded-neighbor requirements.
2. Commit one mutation batch with a monotonically increasing world revision.

The batch records block deltas, inventory deltas, scheduled light and fluid work, affected chunk revisions, mesh invalidations, sound and particle events, and persistence dirtiness. Failure before commit has no effect. Derived-work failure after commit causes recomputation from authoritative state rather than rollback of the committed action.

## Worker protocol and backpressure

Every message is a discriminated union with `protocolVersion`, `jobId`, `worldId`, job kind, priority, revisions, and payload byte length. Responses echo identity fields and include timings. Transfer ownership is explicit; a transferred buffer cannot remain referenced by authoritative state.

The scheduler supports queued cancellation, obsolete-result rejection, worker timeouts, crash replacement, and exponential retry capped at two attempts per job. Repeated deterministic failure marks the chunk failed, records diagnostics, and renders a safe boundary instead of retrying forever. High-priority near-player work may replace low-priority queued work, while accepted in-flight work remains bounded by worker count.

## Persistence consistency

IndexedDB stores immutable committed save generations. A save writes changed records and a manifest into a new generation transaction, verifies required record counts and checksums, then atomically advances the world's committed-generation pointer. Old generations remain until the new commit succeeds and are pruned later under a bounded policy.

Autosave consumes a consistent domain snapshot at a tick boundary. Mutations made during encoding remain dirty for the next save. Save requests coalesce and never run concurrently for the same world. `pagehide` triggers a best-effort flush, but correctness never depends on asynchronous unload work completing.

Export incrementally encodes a versioned envelope with declared sizes and checksums. Import validates magic, schema, generator compatibility, counts, coordinate bounds, decoded-size limits, and checksums before creating a new world transaction. Imported data is never merged directly into an existing world.

## Capability detection and degradation

Startup checks WebGL capability, module workers, IndexedDB, pointer lock, required typed arrays, and storage availability. Missing mandatory capabilities produce a precise unsupported-browser screen. Optional failures degrade predictably through muted audio, shorter render distance, disabled cosmetic effects, or manual-save warnings. Storage quota is monitored where supported and the player is warned before saves are at risk.

## Error handling

- Startup failures show a readable recovery screen.
- Worker failures reject the job, restart the worker within a bounded retry policy, and retain authoritative state.
- Persistence writes use transactions and never replace the last valid world record with a partially encoded value.
- Unsupported or corrupt saves produce a diagnostic message and preserve the original data for export.
- Audio failure is non-fatal.
- WebGL context loss pauses rendering and attempts a bounded restoration.
- An uncaught simulation invariant failure pauses the game, requests a recovery save of the last committed state, and displays diagnostic and export options instead of continuing with unknown state.
- Promise rejections and worker errors pass through one error boundary with stable error codes and redacted structured context.
- Recovery attempts are rate-limited; the same failure cannot create an infinite restart loop.

## Observability

Production builds retain lightweight local counters and a bounded in-memory event ring for frame stalls, worker crashes, stale jobs, queue pressure, save duration and failure, context loss, and invariant failures. No telemetry leaves the device in release one. The player can export a diagnostic report that excludes save contents and user-entered world names by default.

## Dependency and build integrity

The lockfile is committed. CI uses deterministic clean installs, type checking, tests, a production build, and dependency-license review. Production builds contain no test hooks, use content-hashed immutable assets, and disable public source maps by default. Development assertions may be stripped only when equivalent boundary validation remains in production.

## Security and privacy

The release has no accounts, analytics, network gameplay, or required remote services. Imported saves are untrusted data and must be size-limited, schema-validated, and rejected on invalid fields before IndexedDB writes.
