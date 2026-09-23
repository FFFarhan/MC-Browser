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

## ADR-009: Runnable first-pass inventory and save scope

- **Status:** Accepted for the first playable build
- **Context:** The user explicitly prioritized getting the one-shot browser game working over production hardening and agreed that production readiness was not necessary.
- **Decision:** Keep inventory as a validated item-count map with a keyboard-open recipe book, and persist one active world as a validated localStorage save containing the seed, player, survival stats, clock, inventory, and block-mutation journal. Natural terrain remains regenerated in the worker. Provide the early wood-to-iron recipe chain without station placement requirements, plus simple movement hunger, hunger-gated health regeneration, fall damage, wild-berry food, and respawn.
- **Alternatives:** Implement the full 36-slot transactional inventory, shaped recipe grids, nearby workstation/furnace simulation, and IndexedDB immutable save generations before making the world playable.
- **Consequences:** The game can craft, manage basic survival stats, and resume with a small client-only implementation. Death currently retains inventory, and multiple named worlds, slot-level inventory operations, station-gated crafting, furnace timers, export/import, and crash-safe IndexedDB generations remain outside this first working slice. Saved data is schema-checked and bounded before use.
- **Affected specifications:** `docs/GAME_SPEC.md` inventory, crafting, furnace, and save behavior; `docs/ROADMAP.md` milestones M8 and M12.

## ADR-010: Compact, backward-compatible mutation saves

- **Status:** Accepted
- **Context:** The first playable build stores its save as a bounded localStorage payload. Verbose world-coordinate objects make ordinary block edits consume the size budget quickly, while users need a useful reason when persistence fails.
- **Decision:** Encode block mutations as compact chunk-coordinate/index/block-ID tuples. Continue decoding the legacy world-coordinate object format so existing saves remain loadable, validate data before use, and return distinct invalid-data, size-limit, and storage-write failures to the UI.
- **Alternatives:** Increase the payload limit; persist naturally generated chunk data; silently report all write errors as one generic failure.
- **Consequences:** Mutation journals use substantially less space without changing authoritative world state or the storage backend. Legacy saves remain readable, while writes that still exceed the browser limit or encounter unavailable/full storage explain the failure separately.
- **Affected specifications:** `docs/GAME_SPEC.md` persistence behavior; `src/world/WorldSave.ts` save encoding and validation.

## ADR-011: Approved gameplay scope and host-authoritative WebRTC rooms

- **Status:** Accepted; supersedes the first-pass limitations recorded in ADR-009 where they conflict with the current working build.
- **Context:** The user approved continuing the browser game through named worlds, interactive inventory, tools/weapons, simple night/cave creatures, and small-room multiplayer, and explicitly preferred a working build over production hardening. The earlier first-release boundary excluded multiplayer/mobs and ADR-009 limited saves and inventory more narrowly.
- **Decision:** Keep single-player and world saves in the browser, but add an optional invite-only WebRTC star with up to four participants total. The host browser owns the simulation, validates remote requests, and keeps the save. A separately deployable Node/WebSocket signaling process only handles expiring rooms, host approval, SDP/ICE relay, and optional short-lived TURN credentials. Routine reliable game state uses an ordered channel; transient poses use a bounded low-latency channel. Static game assets remain independently hostable. Add local two-browser integration coverage; do not claim public internet connectivity until deployed WSS/TURN endpoints are tested from separate networks.
- **Alternatives:** Keep multiplayer deferred; run the whole simulation on a dedicated authoritative game server; require LAN/port forwarding; use a hosted game platform.
- **Consequences:** The host must stay online, client versions must match, rooms are limited to four, and direct WebRTC may expose peer network candidates. A public HTTPS static host plus WSS signaling and reachable STUN/TURN are needed for reliable internet play. TURN bandwidth/latency is separate from game-server compute because the signaling VM does not simulate the world. Hosting credentials and public deployment remain operator responsibilities.
- **Affected specifications:** `AGENTS.md`; `docs/GAME_SPEC.md`; `docs/ARCHITECTURE.md`; `docs/ROADMAP.md`; `docs/TESTING.md`; `docs/MULTIPLAYER_HOSTING.md`; `src/network/*`; `server/signaling/*`.
