# Browser Voxel Survival Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This is one continuous autonomous build: do not stop at a milestone for approval; stop only for an unrecoverable environment blocker or a safety boundary.

**Goal:** Build and release an original, production-grade, desktop browser voxel survival game with deterministic streamed terrain, a complete early-game loop, durable local saves, and verified static deployment.

**Architecture:** TypeScript domain state owns gameplay on the main thread; Three.js renders derived state; bounded module workers generate terrain and chunk meshes from immutable snapshots. All world mutations are atomic and revisioned, all queues and resident resources are bounded, and persistence uses immutable IndexedDB generations with an atomic manifest pointer.

**Tech Stack:** TypeScript strict mode, Vite, Three.js, Vitest, Playwright, Web Workers, Canvas 2D, IndexedDB, Web Audio API, ESLint, Prettier.

**Spec:** `MASTER_PROMPT.md`, `AGENTS.md`, `DECISIONS.md`, and `docs/{ARCHITECTURE,GAME_SPEC,BLOCKS,WORLD_GENERATION,RENDERING,TEXTURES,PERFORMANCE,TESTING,ROADMAP}.md`; release acceptance is `docs/acceptance/RELEASE_CHECKLIST.md`.

## Global Constraints

- The first release is an original, desktop-first, single-player browser voxel survival game, deployable as static files and playable offline after assets load.
- Use strict TypeScript; blocks use typed-array chunk storage, not one object or Three.js mesh per block.
- World chunks are 16×192×16; valid Y is 0..191; horizontal coordinate conversion uses floor division and handles negative coordinates.
- Main-thread domain state is authoritative. Workers are pure proposal producers and must not mutate shared game state.
- Every worker protocol, persisted record, exported world, registry, and generator includes an explicit version.
- Every asynchronous result must be rejected unless world identity and all relevant job, chunk, content, lighting, and generator revisions still match.
- Domain commands validate and commit block, inventory, entity, queue, and persistence deltas atomically.
- Every queue, retry count, worker count, particle count, cache, decoded import, and resident-resource class has a named finite bound and a safe overload behavior.
- Long-range authoritative coordinates remain integer chunk-plus-local coordinates; rendering and collision use a floating origin.
- Save changes as immutable generations; advance the committed manifest pointer atomically only after validating the new generation.
- No Minecraft code, branding, names, textures, sounds, or UI artwork. No multiplayer, mobs, combat, or other deferred features in this release.
- Keep a runnable production build at every milestone and complete the milestone quality gate before proceeding.

## Review Focus

- Negative coordinates and chunk corners must map to the expected chunk/local cells without seams. Tests belong to Tasks 1, 4, 5, and 6.
- Late, malformed, timed-out, or wrong-world worker results must never mutate or render stale state. Tests belong to Tasks 5 and 7.
- Failed or interrupted writes, mutation during encoding, and quota exhaustion must preserve the last committed world. Tests belong to Task 12.
- Long-distance rebase must not shift gameplay, camera, collision, particles, or chunk attachment. Tests belong to Tasks 1, 3, and 14.
- Browser suspension and subsystem failure must not create runaway catch-up, duplicate jobs, corrupt saves, or prevent recovery. Tests belong to Tasks 0, 5, 12, 13, and 14.

---

## File Structure and Public Contracts

The first milestone creates the Vite shell. Later tasks add these focused modules; a file may be split further when it exceeds one responsibility, but public contracts remain stable:

```text
src/app/{bootstrap,GameApplication,errors}.ts
src/engine/{FixedStepLoop,InputManager,EventBus}.ts
src/shared/{coordinates,chunk-key,protocol,result}.ts
src/world/{BlockRegistry,ChunkData,WorldStore,MutationBatch,ChunkManager}.ts
src/generation/{seed,noise,WorldGenerator,biomes,features}.ts
src/meshing/{faceMesher,greedyMesher,mesh-types}.ts
src/rendering/{Renderer,ChunkView,TextureAtlas,OriginManager}.ts
src/physics/{VoxelRaycast,PlayerCollision}.ts
src/player/{PlayerState,PlayerController,SurvivalSystem}.ts
src/items/{ItemRegistry,ItemStack,Inventory,recipes}.ts
src/gameplay/{BlockInteraction,FurnaceSystem,DropSystem}.ts
src/lighting/{LightEngine,light-queue}.ts
src/fluids/{WaterSystem,fluid-queue}.ts
src/persistence/{Database,WorldRepository,SaveCoordinator,SaveCodec,migrations}.ts
src/audio/{AudioEngine,procedural-sounds}.ts
src/ui/{TitleScreen,HUD,InventoryView,PauseMenu,SettingsView}.ts
src/platform/{capabilities,BrowserLifecycle,StorageMonitor,service-worker}.ts
src/diagnostics/{Metrics,DebugOverlay,DiagnosticExport}.ts
src/workers/{generation.worker,meshing.worker,protocol}.ts
tests/{unit,integration,e2e,benchmarks}/...
```

Stable contracts introduced by their owning task:

```ts
export interface ChunkCoord {
  readonly x: number;
  readonly z: number;
}
export interface LocalCoord {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
export function worldToChunk(
  x: number,
  z: number,
): { chunk: ChunkCoord; localX: number; localZ: number };
export function chunkKey(coord: ChunkCoord): string;

export interface ChunkData {
  readonly coord: ChunkCoord;
  readonly blocks: Uint16Array;
  readonly revision: number;
}
export interface BlockDelta {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly before: number;
  readonly after: number;
}
export interface InventoryDelta {
  readonly slot: number;
  readonly before: ItemStack | null;
  readonly after: ItemStack | null;
}
export interface MutationBatch {
  readonly worldRevision: number;
  readonly blocks: readonly BlockDelta[];
  readonly inventory: readonly InventoryDelta[];
}

export interface WorkerEnvelope<T> {
  readonly protocolVersion: 1;
  readonly jobId: number;
  readonly worldId: string;
  readonly jobType: 'generate' | 'mesh';
  readonly chunk: ChunkCoord;
  readonly priority: number;
  readonly worldRevision: number;
  readonly chunkRevision: number;
  readonly contentRevision: number;
  readonly lightRevision: number;
  readonly generatorVersion: number;
  readonly payloadBytes: number;
  readonly payload: T;
}
export interface MeshBuffers {
  readonly positions: Float32Array;
  readonly normals: Int8Array;
  readonly uvs: Float32Array;
  readonly indices: Uint16Array | Uint32Array;
  readonly light: Uint8Array;
}

export interface SaveManifest {
  readonly schemaVersion: number;
  readonly committedGeneration: number;
  readonly checksum: string;
}
export interface SaveCoordinator {
  requestSave(worldId: string): Promise<SaveResult>;
  flush(worldId: string): Promise<SaveResult>;
}
```

The implementation plan is one continuous task chain. Each task must add focused tests first, observe expected RED, implement, run the whole suite and quality gate, then commit that task before moving on.

## Task 0: Application foundation and capability handling (M0)

**Files:** create `package.json`, lockfile, `index.html`, `vite.config.ts`, `tsconfig.json`, ESLint/Prettier configs, `src/main.ts`, `src/app/{bootstrap,GameApplication,errors}.ts`, `src/platform/capabilities.ts`, `src/engine/FixedStepLoop.ts`, `src/rendering/Renderer.ts`, unit and Playwright configuration/tests, and CI workflow.

**Produces:** `startApplication(root: HTMLElement): Promise<GameApplication>`; `detectCapabilities(): CapabilityReport`; `FixedStepLoop` with `start`, `pause`, `resume`, `dispose`; npm scripts `dev`, `build`, `preview`, `format:check`, `lint`, `typecheck`, `test`, `test:e2e`, and `bench`.

- [x] Test missing required browser capability renders an accessible unsupported screen; test fixed-step loop caps five catch-up ticks and resets elapsed time on visibility resume.
- [x] Run `npm test -- src/platform/capabilities.test.ts src/engine/FixedStepLoop.test.ts`; observed expected RED because exports did not exist.
- [x] Implement the shell, central typed error boundary, feature detection, fixed-step clock, minimal Three.js scene, and production-safe test configuration.
- [x] Run all six quality commands from `MASTER_PROMPT.md`; all pass. Playwright passed against production preview and built assets contain no test hooks.
- [x] Commit `build: establish browser game foundation`.

## Task 1: Coordinates, registries, chunk data, and floating origin (M1)

**Files:** create `src/shared/{coordinates,chunk-key}.ts`, `src/world/{BlockRegistry,ChunkData,WorldStore}.ts`, `src/rendering/OriginManager.ts`, and unit tests for each.

**Consumes:** Task 0 application shell and test scripts. **Produces:** `worldToChunk`, `worldBlockIndex`, `chunkKey`, `BlockRegistry.get(id)`, `ChunkData.get/set`, `WorldStore.getBlock/setGeneratedChunk`, and `OriginManager.rebaseIfNeeded(playerChunk)`.

- [x] Write tests for `x/z = -17,-16,-1,0,15,16,17`, exact index bounds, invalid IDs, serialization round trip, and an origin rebase preserving absolute coordinates.
- [x] Run the focused test command and observe expected RED.
- [x] Implement collision-free chunk keys, floor-based conversion, flat `Uint16Array` storage, registry validation, and chunk/local origin transforms.
- [x] Run unit suite, typecheck, lint, build, and E2E smoke; all pass.
- [x] Commit `feat: add voxel data model and coordinate safety`.

## Task 2: Procedural atlas and reference chunk mesher (M2)

**Files:** create `src/rendering/{TextureAtlas,ChunkView}.ts`, `src/meshing/{mesh-types,faceMesher}.ts`, atlas manifest data, and meshing/texture tests.

**Consumes:** `BlockRegistry`, `ChunkData`, and renderer from Tasks 0–1. **Produces:** `createTextureAtlas(artSeed): { texture: THREE.CanvasTexture; manifest: AtlasManifest }`; `meshChunk(snapshot): MeshBuffers`.

- [x] Test deterministic atlas pixel hash, valid padded UVs, hidden-face suppression, cross-boundary faces, cutout and translucent rules, and repeated geometry disposal.
- [x] Run focused tests and observe expected RED.
- [x] Implement Canvas-generated original 16×16 tiles, a sorted stable atlas manifest, nearest-neighbor sampling, face culling, transferable typed mesh buffers, and a test chunk view.
- [x] Run complete quality gate and benchmark a dense 16×16×16 chunk; internal faces are absent (54 boundary quads), 100 mesh replacements dispose geometry without scene growth, and meshing averages 2.43 ms locally.
- [x] Commit `feat: render voxel chunks with procedural pixel atlas`.

## Task 3: First-person movement and collision (M3)

**Files:** create `src/physics/PlayerCollision.ts`, `src/player/{PlayerState,PlayerController}.ts`, `src/ui/ControlsOverlay.ts`, and movement tests.

**Consumes:** world block queries and `OriginManager`. **Produces:** `PlayerState`, `stepPlayer(state, input, world, dt)`, and `sweepAabb(position, velocity, collider, world)`.

- [ ] Test solid collision, ground contact, jump edge-triggering, frame-rate independence, unloaded-cell barriers, and rebase continuity.
- [ ] Observe focused-test RED; implement axis-separated bounded AABB sweeps, gravity, sprint, crouch, pointer-lock mouse look, and safe spawn.
- [ ] Run quality gate and Playwright movement/pause flow; expect no penetration and same travel distance under 30/60/144 Hz rendering.
- [ ] Commit `feat: add first person movement and voxel collision`.

## Task 4: Ray targeting and atomic block interaction (M4)

**Files:** create `src/physics/VoxelRaycast.ts`, `src/world/MutationBatch.ts`, `src/gameplay/BlockInteraction.ts`, and ray/mutation/integration tests.

**Consumes:** world queries, player camera and collision, block registry. **Produces:** `traceVoxels(origin, direction, maxDistance)`, `validateMutation(command, snapshot)`, and `commitMutation(batch)`.

- [ ] Test axis and corner ray traversal, five-block range, boundaries, invalid placement, player overlap, failed inventory validation, and a successful atomic break/place batch.
- [ ] Observe RED; implement grid traversal and two-phase revisioned mutation commit; emit derived remesh, light, drop, sound, and particle events only after commit.
- [ ] Run full quality gate and browser tests; expect no partial state if validation rejects.
- [ ] Commit `feat: add revisioned block mining and placement`.

## Task 5: Bounded multi-chunk streaming and worker protocol (M5)

**Files:** create `src/shared/protocol.ts`, `src/workers/{protocol,generation.worker,meshing.worker}.ts`, `src/world/ChunkManager.ts`, `src/diagnostics/Metrics.ts`, and worker/manager integration tests.

**Consumes:** chunk/mesh types, mutation revisions, renderer. **Produces:** versioned discriminated worker envelopes; `ChunkManager.updateDesiredSet(playerChunk)`, `schedule`, `acceptResult`, `evict`; bounded `JobScheduler`.

- [ ] Test deterministic synthetic chunks, queued cancellation, wrong-world and stale revisions, malformed payload size, worker timeout/crash/restart, retry cap, queue saturation, player/dirty-save pinning, and out-and-back resource release.
- [ ] Observe RED; implement immutable center-plus-halo snapshots, explicit transfer ownership, bounded priority queues, max-two retries, safe failed-chunk boundary, and staged eviction.
- [ ] Run full gate and a deterministic traversal E2E; expect bounded queues and stable resource counts.
- [ ] Commit `feat: stream chunks with bounded worker scheduling`.

## Task 6: Deterministic seeded world generation (M6)

**Files:** create `src/generation/{seed,noise,biomes,features,WorldGenerator}.ts`, update generation worker, and property/golden generation tests.

**Consumes:** chunk coordinate API, registries, worker protocol. **Produces:** `generateChunk({seed, generatorVersion, coord}): GeneratedChunk`; deterministic safe-spawn query.

- [ ] Test identical output across order/worker count, changed output for distinct seeds, all six biome signatures, cave/ore/tree placement at chunk borders, ocean fill, spawn bounds, and generator-version rejection.
- [ ] Observe RED; implement hash-derived independent feature seeds, climate fields, terrain layers, 3D cave noise, ore veins, anchored structures, and sunlight inputs.
- [ ] Run quality gate, golden-seed snapshots, and 100-chunk seam traversal; expect no load-order variation or feature seams.
- [ ] Commit `feat: generate deterministic biome terrain in workers`.

## Task 7: Greedy worker meshing and GPU lifecycle (M7)

**Files:** create `src/meshing/greedyMesher.ts`, update meshing worker and `ChunkView`, add equivalence/performance tests.

**Consumes:** `GeneratedChunk`, center-plus-halo snapshots, atlas and render layer rules. **Produces:** optimized `MeshBuffers` with positions, normals, UVs, indices, and light.

- [ ] Test greedy output against reference face coverage, texture/light merge compatibility, transparent boundaries, index-width selection, stale revisions, and disposal on unload/context restore.
- [ ] Observe RED; implement merge masks keyed by face, texture, render layer, light, and material flags; reject oversized or malformed worker buffers.
- [ ] Run all tests and mesh benchmark; expect identical surface coverage and lower quad count on flat terrain.
- [ ] Commit `perf: add revision-safe greedy chunk meshing`.

## Task 8: Items, inventory, crafting, drops, tools, and furnace (M8)

**Files:** create `src/items/{ItemRegistry,ItemStack,Inventory,DropSystem,recipes}.ts`, `src/gameplay/FurnaceSystem.ts`, `src/ui/{HUD,InventoryView,CraftingView,FurnaceView}.ts`, and unit/E2E tests.

**Consumes:** mutation batches, registries, fixed-step clock, persistence-facing domain state. **Produces:** `Inventory.apply(command)`, `matchRecipe(grid, registry)`, `tickFurnace(state, dt)`, and item pickup/placement commands.

- [ ] Test stack conservation, full slots, split/merge/shift transfer, recipe rotations/offsets, failed output capacity, durability, drops, furnace fuel fractions, blocked output, pause, and loaded/unloaded persistence state.
- [ ] Observe RED; implement atomic 27-slot inventory plus 9-slot hotbar, 2×2/3×3 shaped/shapeless crafting, recipes, tools, and loaded-chunk smelting.
- [ ] Run full gate and end-to-end wood-to-iron progression; expect no item duplication or loss.
- [ ] Commit `feat: add inventory crafting tools and furnace`.

## Task 9: Health, hunger, death, respawn, and world time (M9)

**Files:** create `src/player/SurvivalSystem.ts`, `src/world/WorldClock.ts`, update sky renderer and HUD, add deterministic survival tests.

**Consumes:** fixed simulation ticks, player and inventory state, drop system. **Produces:** deterministic `tickSurvival` and `tickWorldClock` transitions.

- [ ] Test hunger drain, regeneration thresholds, starvation floor, fall damage, death drops, safe respawn, pause freeze, and 20-minute day/night wrap.
- [ ] Observe RED; implement health/hunger and world-time state machines, death UI, respawn, and sky/fog/sun/moon interpolation.
- [ ] Run full gate and browser cycle; expect paused simulation to change no survival state.
- [ ] Commit `feat: add survival needs and day night cycle`.

## Task 10: Bounded cross-chunk lighting (M10)

**Files:** create `src/lighting/{LightEngine,light-queue}.ts`, extend chunk snapshots and mesh buffers, add property and integration tests.

**Consumes:** authoritative block events, chunk borders, scheduler. **Produces:** deterministic sunlight/block-light arrays and bounded incremental propagation.

- [ ] Test source add/remove, roof shadowing, chunk-border convergence, queue saturation, unloaded-border suspension, and rebuild equivalence to full recomputation.
- [ ] Observe RED; implement bounded flood-fill addition/removal queues, compact light arrays, revisioned mesh invalidation, and per-tick budgets.
- [ ] Run full gate and light benchmark; expect convergence to reference values with no unbounded queue.
- [ ] Commit `feat: add bounded voxel sunlight and block lighting`.

## Task 11: Bounded water and swimming (M11)

**Files:** create `src/fluids/{WaterSystem,fluid-queue}.ts`, update water mesh rules and player controller, add fluid tests.

**Consumes:** mutation commit pipeline, chunk lifecycle, fixed ticks. **Produces:** level-based water updates with stable source behavior.

- [ ] Test downward/horizontal spread, solid barriers, finite budget, unloaded border resume, pause behavior, swimming collision, and deterministic replay.
- [ ] Observe RED; implement queued 0–7 level propagation, source rules, animated atlas frame, and swimming.
- [ ] Run full gate and bounded-water soak; expect no update loop or queue growth.
- [ ] Commit `feat: add bounded water simulation and swimming`.

## Task 12: Durable IndexedDB persistence and world import/export (M12)

**Files:** create `src/persistence/{Database,WorldRepository,SaveCoordinator,SaveCodec,migrations}.ts`, schema definitions, fault-injection adapters, and persistence integration tests.

**Consumes:** serializable domain state, seed/generator version, sparse mutation map. **Produces:** versioned world repository, immutable save generations, atomic manifest, `requestSave`, `flush`, `exportWorld`, `importWorld`.

- [ ] Test commit interruption at every phase, transaction abort, mutation during encode, concurrent save coalescing, quota failure, checksum mismatch, old schema migration, oversized/malformed import, and export/import round trip.
- [ ] Observe RED; implement consistent tick-boundary snapshots, immutable generations, checksums, atomic manifest pointer, bounded import, migration registry, quota warning, and recovery/export path.
- [ ] Run full gate and browser refresh/round-trip tests; expect the last committed save preserved under every injected failure.
- [ ] Commit `feat: persist worlds with atomic save generations`.

## Task 13: Menus, settings, audio, and accessibility (M13)

**Files:** complete `src/ui/*`, `src/audio/{AudioEngine,procedural-sounds}.ts`, `src/platform/BrowserLifecycle.ts`, and keyboard/accessibility/browser tests.

**Consumes:** game lifecycle, persistence, controls, registries. **Produces:** title/world management, pause/settings, keyboard navigation, key rebinding, audio controls, progress UI, reduced-motion setting.

- [ ] Test keyboard-only workflows, modal focus, 200% zoom, pointer-lock loss, world-delete confirmation, import rejection, reduced motion, and missing-audio recovery.
- [ ] Observe RED; implement original procedural effects, UI states, settings persistence, loading/failure recovery, and accessible semantics.
- [ ] Run full gate and cross-browser e2e flows; expect game remains playable with audio unavailable.
- [ ] Commit `feat: complete game menus audio and accessibility`.

## Task 14: Service worker, performance, diagnostics, and release (M14)

**Files:** create `src/platform/service-worker.ts`, `src/diagnostics/{DebugOverlay,DiagnosticExport}.ts`, benchmarks, deployment/readme/license docs, and release tests.

**Consumes:** all prior systems and release checklist. **Produces:** versioned atomic static cache, bounded local diagnostic ring, exportable redacted report, reproducible production bundle, and documented deployment.

- [ ] Test cache upgrade/rollback, offline reload, saved-world exclusion, test-hook/source-map exclusion, 20-minute traversal plateau, repeated context loss, queue overload recovery, and save-quota warning.
- [ ] Observe RED; implement asset cache versioning, clean-cache activation, diagnostics and export, renderer restoration, measured tuning, dependency license inventory, and release documentation.
- [ ] Run all six quality commands, clean install, benchmark suite, full browser journey on Chrome/Firefox/Safari, offline test, and 20-minute soak; expect release checklist complete and measured targets recorded.
- [ ] Commit `release: harden and package browser voxel survival game`.

## Execution Notes

- Follow `docs/ROADMAP.md` milestone gates and `docs/acceptance/RELEASE_CHECKLIST.md`; this plan is the implementation detail, those files remain product authority.
- On each task, run the named focused RED test before implementation, then run its focused test and the complete six-command quality gate before commit.
- Record any necessary deviation in `DECISIONS.md` with context, decision, alternatives, consequences, and cost if wrong.
- After Task 14, run a separate whole-branch review against the Review Focus and release checklist. Fix Critical/Important issues test-first, document Minor findings, and report any acceptance item that remains unverified.
