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
