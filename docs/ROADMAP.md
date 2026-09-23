# Milestone Roadmap

## Current working build

The approved playable slice now includes per-world local saves and Save & New, timed block-specific mining, icon-based interactive inventory and recipes, craftable/equipable tools and weapons, night/cave-only simple mobs, mouse-wheel hotbar selection, a real RAF FPS display, and optional four-player host-authoritative WebRTC rooms. Multiplayer has local two-browser coverage for invite approval and host-to-guest block-drop synchronization. Public internet connectivity still depends on deployment of HTTPS/WSS signaling and a TURN service. This working build deliberately does not claim the full production roadmap gates below (for example, complete lighting/water/audio systems, long soak, or service-worker release hardening).

Every milestone ends with a runnable application, focused acceptance tests, the full quality gate, updated documentation, and a commit. Milestones are sequential unless this document explicitly states otherwise.

## M0 — Foundation

Create the Vite TypeScript application, Three.js canvas, lifecycle shell, fixed-step loop, central error boundary, structured result and error types, platform capability detection, formatting, linting, Vitest, Playwright, build scripts, and CI-compatible commands. Define stable worker-message and persistence version primitives. Display an empty procedural sky and acquire/release pointer lock safely.

**Gate:** all six quality commands succeed; the production bundle loads from a static server; unsupported capabilities and injected startup failures show readable recovery screens; production contains no test hooks.

## M1 — Voxel model

Implement block and item registries, coordinate math, collision-free chunk keys, chunk storage, block access, serialization primitives, mutation overlays, revision counters, and floating-origin conversion utilities.

**Gate:** round-trip, safe-range, rebase, and boundary tests pass, including all required negative coordinates; storage uses typed arrays; invalid IDs, non-finite values, and Y coordinates are safe.

## M2 — Atlas and one rendered chunk

Generate the original procedural atlas, create face-culling mesh buffers, render one deterministic test chunk, and dispose replaced geometry.

**Gate:** hidden faces are absent, transparent rules are correct, pixel hashes are deterministic, and repeated rebuilds do not leak resources.

## M3 — Player movement and collision

Add camera control, fixed-step movement, gravity, jump, sprint, crouch, AABB collision, ground state, safe spawn, pause, and settings for FOV and sensitivity.

**Gate:** collision and frame-rate independence tests pass; the player cannot enter solids or fall through absent terrain.

## M4 — Block interaction

Add voxel ray traversal, selection outline, mining progress, hardness and tool rules, two-phase mutation batches, placement, particles, item drops, and boundary remeshing.

**Gate:** edits work across chunk boundaries, block and inventory actions are atomic and revisioned, placement cannot overlap the player, derived-work failure is recoverable, and mining drops follow registry rules.

## M5 — Multi-chunk streaming

Implement desired-set calculation, independent residency flags, lifecycle states, capacity-limited priority queues, load and unload behavior, eviction pinning, immutable neighbor halos, versioned worker messages, stale-result rejection, fault recovery, and bounded scheduling using deterministic synthetic test chunks.

**Gate:** continuous traversal loads ahead and unloads behind; teleportation cannot attach obsolete meshes; crash, timeout, and saturation tests degrade safely; memory and GPU-resource counts return near baseline after a round trip.

## M6 — Worker world generation

Implement seeds, noise fields, six biomes, terrain layers, oceans, safe spawn, caves, ores, trees, vegetation, and the generation worker protocol.

**Gate:** generation is independent of order and worker count, features cross borders without seams, and the main thread performs no terrain generation.

## M7 — Greedy meshing workers

Move meshing to workers, implement compatibility-aware greedy merging, add per-vertex light channels, and prioritize remeshing correctly.

**Gate:** geometry matches the reference face mesher, quad count improves on representative terrain, and stale or invalid mesh buffers are rejected.

## M8 — Inventory and crafting

Build the hotbar, inventory model and UI, atomic slot interactions, pickup rules, tool durability, 2×2 and 3×3 crafting, required recipes, crafting station behavior, and persistent loaded-chunk furnace smelting.

**Gate:** transaction, recipe, and furnace edge-case tests pass; the complete wood-to-iron-grade progression is possible without duplication or loss.

## M9 — Survival and time

Implement health, hunger, activity costs, regeneration, starvation, fall damage, death drops, respawn, day/night time, sky changes, and pause semantics.

**Gate:** fixed-time tests are deterministic; pausing stops simulation; death and respawn preserve the documented rules.

## M10 — Lighting

Implement sunlight and block light with addition and removal queues, chunk-border propagation, mesh invalidation, and bounded per-tick work.

**Gate:** roofs darken, emissive blocks illuminate, removal converges, borders remain consistent, and update queues cannot grow without a configured bound.

## M11 — Water

Add water render frames, swimming, finite level-based downward and horizontal spreading, source behavior, border suspension, and bounded update queues.

**Gate:** water cannot create an infinite loop, resumes safely when a neighbor loads, respects solids, and stays within simulation budgets.

## M12 — Persistence

Create the IndexedDB schema, immutable save generations, atomic manifest pointer, checksums, world repository, mutation storage, player and inventory saves, coalesced autosave, quota handling, migrations, bounded export and import, corruption recovery, and transactional writes.

**Gate:** refresh restores the complete state; unmodified terrain regenerates; interruption at every commit phase retains the last valid save; mutation during encoding stays dirty; corrupt and oversized imports are rejected before world creation; quota failure offers export and recovery.

## M13 — Menus, audio, and accessibility

Complete world management, pause and settings menus, rebinding, procedural audio, HUD feedback, keyboard navigation, zoom behavior, reduced motion, and loading progress.

**Gate:** the game remains playable without audio; menus pass keyboard workflows; deletion and import require safe confirmation and validation.

## M14 — Performance and release

Add the bounded local diagnostic ring, diagnostic export, long-frame metrics, benchmarks, queue tuning, measured object reuse, origin-rebase soak testing, a versioned service worker and production asset cache, cross-browser fixes, clean-install build verification, dependency-license review, documentation, release build, and final acceptance testing. The service worker must update atomically, discard obsolete caches after activation, and never cache imported world data or IndexedDB contents.

**Gate:** performance targets and the 20-minute soak are measured, queue and resource counts stabilize, injected subsystem failures recover safely, the full release checklist passes, static hosting and offline upgrade work, and no required feature is a placeholder.

## Deferred roadmap

Future independent work: improve creature AI/animation, weather and structures, multiplayer beyond four players, persistent dedicated-server authority/host migration, mobile controls, and mod support. None is part of the current working slice.
