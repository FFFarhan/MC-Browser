# Architecture Decision Log

Do not edit earlier entries to disguise a changed decision. Add a new entry that supersedes the old one.

## ADR-001: Three.js rendering with a custom voxel engine

- **Status:** Accepted
- **Context:** The game requires custom chunk storage, generation, meshing, interaction, and persistence while remaining practical for a browser-first implementation.
- **Decision:** Use Three.js for WebGL rendering and build voxel simulation systems independently of scene objects.
- **Alternatives:** Babylon.js; raw WebGL or WebGPU.
- **Consequences:** Rendering setup is accelerated, but chunk lifecycle, meshing, lighting, physics, and gameplay remain application responsibilities.

## ADR-002: Deterministic horizontal chunk world

- **Status:** Accepted
- **Decision:** Use 16×16 horizontal chunks with a fixed 192-block vertical range for release one. Use integer world coordinates and floor-based conversions that work for negative positions.
- **Consequences:** Storage, lighting, and meshing remain bounded. Infinite vertical terrain is deferred.

## ADR-003: Worker-owned generation and meshing jobs

- **Status:** Accepted
- **Decision:** Workers execute pure generation and meshing jobs from immutable inputs. The main thread owns authoritative world state and rejects stale results using job and revision identifiers.
- **Consequences:** Worker results can be tested independently and transferred efficiently; scheduling and cancellation semantics must be explicit.

## ADR-004: Seed plus mutation persistence

- **Status:** Accepted
- **Decision:** IndexedDB stores world metadata, player state, settings, and mutations relative to deterministic generated terrain.
- **Consequences:** Saves remain compact; generator versions and migrations are part of the save format.

## ADR-005: Floating render origin

- **Status:** Accepted
- **Context:** Effectively unbounded integer world coordinates eventually exceed the precision at which Three.js GPU transforms and JavaScript physics remain stable.
- **Decision:** Keep authoritative positions as chunk-plus-local integers and rebase derived rendering and physics coordinates around the player at simulation boundaries.
- **Alternatives:** Limit world size; use raw large floating-point scene positions.
- **Consequences:** Long-distance travel remains stable, while rendering and effects must respond to one coordinated rebase event.

## ADR-006: Revisioned asynchronous proposals

- **Status:** Accepted
- **Context:** Generation and meshing may finish after chunks change, unload, or belong to another opened world.
- **Decision:** Worker outputs are non-authoritative proposals accepted only when their complete identity and revision tuple matches current authoritative state.
- **Alternatives:** Cancel every in-flight job; let workers share mutable memory.
- **Consequences:** Stale results are harmless and measurable; message schemas and revision increments require strict tests.

## ADR-007: Immutable save generations

- **Status:** Accepted
- **Context:** Browser shutdown, quota errors, and transaction aborts can interrupt persistence.
- **Decision:** Write each save as a new immutable generation and atomically advance a small committed-generation manifest only after validation.
- **Alternatives:** Update records in place; maintain one monolithic save blob.
- **Consequences:** The last committed save survives partial writes at the cost of temporary duplicate storage and later bounded garbage collection.

## ADR-008: Atomic domain commands

- **Status:** Accepted
- **Context:** Mining, placement, crafting, pickup, and furnace actions change multiple pieces of state and can duplicate or lose items when partially applied.
- **Decision:** Validate commands against one committed tick and apply their block, inventory, entity, queue, and dirty-state changes as one mutation batch.
- **Alternatives:** Let each subsystem react and mutate independently through events.
- **Consequences:** Domain actions are consistent and testable; derived rendering and audio events are emitted only after commit.
