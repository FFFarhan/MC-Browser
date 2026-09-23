# Gameplay fixes and multiplayer implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use the approved spec and keep a playable build; run each task's focused tests before continuing. The user selected continuous in-session execution with no additional approval stops.

**Goal:** Correct controls and inventory behavior, add named persistent worlds, usable gear, night/cave-only mobs, functional hotbar/FPS diagnostics, and self-hostable four-player internet multiplayer.

**Architecture:** Keep the existing browser game and deterministic worker world. Add a world catalog above game-session construction, a compact item/equipment extension to the existing count-map model, and a bounded domain mob simulation. Multiplayer is an optional host-authoritative WebRTC star; a separate small WebSocket process handles temporary room signaling, while STUN/TURN configuration handles Internet connectivity. Do not upload world saves or move simulation to a remote server.

**Tech Stack:** TypeScript strict mode, Vite, Three.js, Vitest, Playwright, Web Workers, browser WebRTC, Node.js 24, and the `ws` package for the separately deployed signaling service.

**Spec:** `docs/superpowers/specs/2026-09-23-gameplay-and-multiplayer-design.md`

## Global Constraints

- Build an original voxel survival game, not a branded Minecraft clone.
- Target keyboard-and-mouse desktop browsers; keep the client static-hostable and client-side for single-player.
- Keep world generation deterministic for a given seed and generator version; use compact typed arrays for blocks.
- Treat the main thread as latency-sensitive; terrain and chunk meshes stay in Web Workers.
- Dispose replaced Three.js geometries, materials, textures, and render targets.
- Test negative coordinates and chunk boundaries explicitly.
- Validate all persistence and network data before use.
- Keep registries data-driven and subsystem APIs narrow and independently testable.
- Do not create one Three.js mesh or JS object per block; bound all mob and network queues.
- Multiplayer has four participants maximum, host authority, invite-only rooms, no accounts, and no ChatGPT hosting.
- Do not continue past a failing quality gate; keep the existing game playable throughout.

## Review Focus

- Nonzero yaw changes the camera-relative right vector: test `A`/`D` at `0`, `+π/2`, and `-π/2` and verify horizontal mouse movement turns right.
- Exiting pointer lock for inventory must not trigger pause, keep camera input active, or hide the system pointer; test both modal open/close and pointer-lock denial.
- A failed Save & New operation must not create or open another world or overwrite the saved current world.
- Daytime surface mob candidates must be rejected even at a dark-looking visual setting; cave candidates need a roof and no sky exposure.
- Invalid, oversized, wrong-room, wrong-world, and rate-flooded multiplayer packets must not mutate game state or grow an unbounded queue.

---

### Task 1: Correct camera controls, menu pointer lifecycle, glass, and shared order

**Files:**

- Modify: `src/player/PlayerState.ts`, `src/player/PlayerState.test.ts`, `src/player/PlayerController.ts`, `src/player/PlayerController.test.ts`
- Modify: `src/app/GameApplication.ts`, `src/ui/InventoryView.ts`, `src/ui/InventoryView.test.ts`
- Modify: `src/rendering/TextureAtlas.ts`, `src/rendering/TextureAtlas.test.ts`, `src/style.css`
- Modify: `src/world/defaultBlocks.test.ts`, `src/ui/HotbarView.ts`, `src/ui/HotbarView.test.ts`

**Interfaces:**

- `stepPlayer(state,input,world,dt)` remains the pure movement boundary; `lookX` is a rightward-positive yaw delta and horizontal movement derives from the same yaw basis as the camera.
- Inventory open/close continues through `onOpenChange(open)`; add an explicit player-control suspend/resume path that does not route deliberate pointer-lock release through `pauseGame`.
- Expose a stable ordered item-ID constant for inventory and hotbar views to consume; neither view may maintain a separate order.

- [x] Add tests asserting positive `lookX` turns right, `D` matches camera-right and `A` matches camera-left at the three review headings, and vertical pitch behavior is unchanged.
- [x] Add a controller test that releases pointer lock on modal open, ignores pointer deltas while controls are suspended, and does not invoke pause for an intentional unlock.
- [x] Add atlas coverage asserting glass has mostly transparent pixels and opaque bright frame pixels; atlas coverage and browser inventory interaction pass.
- [x] Add a shared-order test comparing the hotbar list with the inventory's first ordered items.
- [x] Ran the focused tests and confirmed the assertions failed against the original defects.
- [x] Implement camera-space strafe vectors, rightward-positive mouse yaw, explicit modal input suspension, pointer-lock release/reacquisition only on user input, lower-alpha glass art/material settings, and the shared ordering export.
- [x] Re-ran focused tests and `npm run typecheck`; Playwright suite passed after world-session integration.

### Task 2: World catalog, existing-save migration, and Save & New World

**Files:**

- Create: `src/world/WorldCatalog.ts`, `src/world/WorldCatalog.test.ts`, `src/ui/WorldSelectionView.ts`, `src/ui/WorldSelectionView.test.ts`
- Modify: `src/world/WorldSave.ts`, `src/world/WorldSave.test.ts`, `src/app/bootstrap.ts`, `src/app/GameApplication.ts`, `src/main.ts`, `src/style.css`

**Interfaces:**

- `listWorlds(storage): readonly WorldSummary[]`, `createWorld(storage,input): WorldSummary`, `loadWorld(storage,worldId): WorldSave | null`, and `saveWorld(storage,worldId,save): WorldSaveWriteResult` own catalog validation and per-world keys.
- World save schema v2 stores `worldId`, `worldName`, and later hotbar/equipment state; `decodeWorldSave` accepts v1 and returns a normalized v2 record.
- An application/session controller owns either the world picker or one `GameApplication`; replacing the session disposes its worker, renderer resources, and event listeners first.
- `GameApplication.persistWorld()` returns the typed result so Save & New only navigates after a successful flush.

- [x] Test catalog validation, stable unique IDs, name/seed validation, per-world save isolation, missing saves, and malformed records.
- [x] Test v1 migration preserves seed, player pose, inventory, world clock, survival values, and block mutations; test v2 round-trip includes world metadata.
- [x] Test Save & New saves first and leaves the current world active on storage failure; Playwright verifies no picker transition on failure.
- [x] Ran the focused tests and confirmed missing/new schema cases failed before implementation.
- [x] Add catalog storage and migration functions, create/list/select world UI, and session teardown/remount in `bootstrap.ts`.
- [x] Add a pause/world action labeled `Save & New World`; on success return to the picker with the create form open, on failure keep the session active and show the exact failure.
- [x] Playwright verified creating a named world, preserving the original, and reopening it after reload.

### Task 3: Equipable tools, weapons, inventory assignments, and mining/combat rules

**Files:**

- Modify: `src/world/ItemRegistry.ts`, `src/gameplay/recipes.ts`, `src/gameplay/Crafting.test.ts`
- Create: `src/world/ItemRegistry.test.ts`
- Create: `src/gameplay/Equipment.ts`, `src/gameplay/Equipment.test.ts`
- Modify: `src/gameplay/BlockInteraction.ts`, `src/gameplay/BlockInteraction.test.ts`, `src/world/MutationBatch.ts`, `src/world/MutationBatch.test.ts`
- Modify: `src/world/WorldSave.ts`, `src/world/WorldSave.test.ts`, `src/ui/HotbarView.ts`, `src/ui/InventoryView.ts`, related UI tests, `src/rendering/TextureAtlas.ts`, `src/app/GameApplication.ts`

**Interfaces:**

- Item definitions add validated optional `miningMultiplier`, `attackDamage`, and `maxDurability`; weapon definitions use `kind: 'weapon'` and a positive attack value.
- `evaluateMiningTool(block, heldItem): { speedMultiplier:number; dropAllowed:boolean }` is a pure rules function.
- `applyDurability(state,itemId,uses): EquipmentState` returns remaining durability and whether the item broke; tools and weapons are non-stackable (count 0/1 per type).
- Hotbar assignments are a nine-entry item-ID array stored with the world save; assigning a currently assigned ID moves it rather than duplicating it.

- [x] Write tests for matching class/tier speed, insufficient-tier no-drop behavior, hand mining, durability decrement/break, weapon cooldown/damage, and hotbar assignment uniqueness.
- [x] Add item recipes and original atlas icons for wooden/stone/iron tool classes and melee weapons; assert all registered icons exist and every recipe references valid items.
- [x] Extend save tests with durability/hotbar migration and invalid durability rejection.
- [x] Run focused equipment, crafting, mutation, registry, save, and UI tests; the full unit suite passes.
- [x] Implement equipment rules and feed the selected hotbar item into mining targets; consume durability atomically only after successful block changes or attacks.
- [x] Add inventory assignment control for the selected hotbar slot and render the shared ordering; empty or broken tools clear stale assignments.
- [x] Playwright verifies crafting and tool assignment; unit tests cover tier/drop, durability, and combat. Full unit suite, typecheck, lint, and build pass.

### Task 4: Bounded cave/night mob simulation and visuals

**Files:**

- Create: `src/gameplay/MobSystem.ts`, `src/gameplay/MobSystem.test.ts`, `src/gameplay/MobRegistry.ts`
- Create: `src/rendering/MobView.ts`, `src/rendering/MobView.test.ts`
- Modify: `src/app/GameApplication.ts`, `src/gameplay/Equipment.ts`, `src/world/WorldSave.ts`, `src/style.css`

**Interfaces:**

- `canSpawnMob(candidate,worldTime,world): boolean` is a pure spawn-rule query; surface candidates require `dayPhase(worldTime)==='night'`, cave candidates require solid overhead terrain and no vertical sky exposure.
- `MobSystem.tick(dt,worldTime,player,world)` mutates only bounded domain records (maximum 12 total, at most 3 per chunk); records contain stable ID, type, position, health, cooldown, and alive state.
- `MobView.update(mobs,renderOrigin)` writes matrices to a fixed number of shared `InstancedMesh` objects; it does not create mesh-per-voxel geometry.

- [x] Add pure tests for day surface rejection, night surface allowance, cave allowance independent of time, roof/sky rejection, valid spawn floor, minimum distance, per-chunk/global cap, pause, and attack cooldown.
- [x] Add rendering test that repeated mob updates preserve bounded scene object count and dispose shared resources on teardown.
- [x] Run focused mob and rendering tests; the full unit suite passes.
- [x] Implement two data-driven hostile types, deterministic bounded spawning, short-range pursuit using existing collision queries, melee damage, cooldowns, drops, and pause semantics.
- [x] Render the two types with shared original voxel-style geometry/materials and synchronize attack targeting with equipped weapons.
- [x] Playwright verifies nighttime surface spawning and daytime absence; unit tests verify cave roofs, cave/daytime eligibility, combat, drops, and pause. Full tests and build pass.

### Task 5: Scroll-wheel hotbar selection and measured FPS

**Files:**

- Create: `src/diagnostics/FpsSampler.ts`, `src/diagnostics/FpsSampler.test.ts`
- Modify: `src/ui/HotbarView.ts`, `src/ui/HotbarView.test.ts`, `src/engine/FixedStepLoop.ts`, `src/engine/FixedStepLoop.test.ts`, `src/app/GameApplication.ts`, `src/ui/ControlsOverlay.ts`, `src/style.css`

**Interfaces:**

- `FpsSampler.addFrame(timestampMs): number | null` returns a rounded FPS estimate once at least one one-second window has elapsed; it uses render timestamps, not simulation tick count.
- Hotbar wheel selection wraps 0..8 and is enabled only when the game is active and inventory/modal scrolling is not in progress.

- [x] Test 30, 60, and 144 timestamped frames per second, irregular frame intervals, initial warm-up, pause/stale indicator behavior, wheel up/down, wraparound, and disabled states.
- [x] Run focused tests and resolve the missing APIs/incorrect-selection cases.
- [x] Feed the `requestAnimationFrame` timestamp to `FpsSampler`; render a labeled HUD value and clear stale values on pause/visibility changes.
- [x] Add a non-passive game-viewport wheel handler that prevents page scrolling only during active play; keep menu scroll behavior native.
- [x] Verify the live HUD sample reports 60 FPS; unit tests exercise 30/60/144 FPS and the wheel handler's selection/wrap/disabled behavior.

### Task 6: Multiplayer protocol, runtime transport, and self-hostable signaling

**Files:**

- Create: `src/network/protocol.ts`, `src/network/protocol.test.ts`, `src/network/SignalingClient.ts`, `src/network/PeerSession.ts`, corresponding tests
- Create: `server/signaling/package.json`, `server/signaling/tsconfig.json`, `server/signaling/src/server.ts`, `server/signaling/src/server.test.ts`, `server/signaling/Dockerfile`, `server/signaling/.env.example`
- Modify: root `package.json`, `package-lock.json`, `.gitignore`, Vite runtime configuration

**Interfaces:**

- `NetworkMessage` is a versioned discriminated union with bounded JSON size, room ID, host/guest identity, and message type (`hello`, `accept`, `snapshot`, `input`, `player-state`, `world-delta`, `leave`, `error`).
- `SignalingClient` exchanges only room/SDP/ICE messages over WSS; `PeerSession` exposes `connect`, `sendReliable`, `sendPresence`, and idempotent `close`.
- Signaling rooms expire, cap four peers, limit per-socket message rates and bytes, and reject unknown types/rooms; TURN credentials are short-lived and generated server-side from environment configuration.

- [x] Add protocol parser tests for valid round trips, unknown version/type, malformed JSON, payload limits, wrong world ID, and invalid numeric coordinates.
- [x] Add signaling unit/integration tests for room create/join/host acceptance, capacity, expiration, rate limit, origin policy, malformed SDP/ICE envelopes, disconnect cleanup, and TURN credential TTL.
- [x] Run focused network and signaling tests; protocol and service coverage passes.
- [x] Add the isolated `ws` service and npm scripts `signal:build`, `signal:start`, and `signal:test`; bind configuration to environment variables and never place TURN shared secrets in Vite output.
- [x] Implement WebRTC peer session with one reliable channel for authority/mutations and one bounded unordered channel for transient poses; reject data before host validation and apply only host-authorized state.
- [x] Implement host-authoritative room snapshots, movement/action request validation, generator/content version handshake, guest approval, host/guest disconnect status, and configurable ICE servers.
- [x] Add self-hosting instructions and a container image; do not deploy to an external provider or embed production credentials.

### Task 7: Room UI, browser integration, resource measurement, and handoff

**Files:**

- Create: `tests/e2e/multiplayer.spec.ts`, `src/diagnostics/ResourceEstimate.ts`, `src/diagnostics/ResourceEstimate.test.ts`, `docs/MULTIPLAYER_HOSTING.md`
- Modify: `src/ui/WorldSelectionView.ts`, `src/ui/WorldSelectionView.test.ts`, `src/app/bootstrap.ts`, `src/app/GameApplication.ts`, `src/style.css`, `docs/GAME_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/TESTING.md`, `AGENTS.md`, `DECISIONS.md`

**Interfaces:**

- World selection exposes `Host online world` and `Join by invite`; hosts can approve/reject join requests and guests see connection phase/error details.
- `readResourceEstimate(navigator,performance)` returns only supported measurements and marks unsupported values explicitly; it distinguishes JS heap, origin storage, build asset bytes, and OS process RSS.

- [x] Add a Playwright scenario with two isolated browser contexts that verifies room setup, host approval, a synchronized mined-block drop, and host-disconnect status; protocol/server tests cover invalid packets and disconnect cleanup.
- [x] Add resource-estimate tests for browsers with and without `performance.memory` and `navigator.storage.estimate`; avoid claiming access to total device RAM.
- [x] Implement host/join UI and browser integration, and show a clear message if signaling configuration is absent while leaving single-player playable.
- [x] Update product boundaries, architecture, roadmap, testing docs, and decisions so multiplayer/mob scope matches the approved release.
- [x] Run format, lint, typecheck, unit, signaling, build, diff, and Playwright gates. Local Chromium-to-Chromium room sync passes; public cross-network play remains unverified until an endpoint is deployed.
- [x] Measure a local gameplay sample, Vite server, browser-process RSS, JS heap, local save bytes, and built/gzip sizes; keep them separate and timestamp them in `docs/MULTIPLAYER_HOSTING.md`.
- [x] Research static hosting, TURN, and VPS sizing from official sources; document separate client/server recommendations, P2P authority, and TURN bandwidth/latency trade-offs.

## Handoff boundary

The requested in-repository build is complete and locally verified. This repo includes the signaling service and deployment/configuration instructions, but no public endpoint or TURN relay has been deployed. To let people join from other networks, deploy those services and set the HTTPS signaling URL in `public/runtime-config.js`; then run a two-network acceptance test. No such external deployment or credentials were authorized or performed here.
