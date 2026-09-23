# Gameplay fixes, progression, and small-room multiplayer

## Purpose and approved scope

Extend Stonefield into a usable single-player survival game and then add invite-only browser multiplayer. The implementation remains an original, client-side voxel game; multiplayer must not depend on ChatGPT hosting. Work proceeds in this order, with a runnable build and focused verification after each stage:

1. Correct horizontal look and strafing; make the inventory cursor visible and stop camera input while menus are open; make glass visibly translucent; unify inventory/hotbar item ordering.
2. Add named world creation and selection while preserving the existing local world.
3. Make craftable tools and weapons equipable and useful.
4. Add simple original hostile mobs whose spawn rules permit them only at night on the surface or underground in caves.
5. Add scroll-wheel hotbar selection and an FPS display based on measured rendered frames.
6. Add invite-only online multiplayer for up to four players total, subject to an independently hosted signaling service and configured ICE/TURN servers.

The first five stages must be complete and tested before multiplayer work begins. All six stages form one continuous implementation effort; this sequencing does not require approval between stages.

## Existing behavior and observed causes

- `PlayerState` adds horizontal mouse delta to yaw, while the Three.js camera's positive yaw turns in the opposite horizontal direction. Its strafe Z component also disagrees with the camera's right vector. Looking or moving after turning therefore reverses left/right behavior.
- `GameApplication` disables the hotbar when inventory opens but does not deactivate the player controller or leave pointer lock. This hides the system pointer and continues accumulating look input over the menu.
- Glass is routed to the translucent material, but its generated atlas pixels have high alpha and its appearance is close to opaque.
- `HotbarView` owns a hard-coded block order while `InventoryView` follows item-registry ID order.
- Saves use one legacy world key. Tool items and recipes exist, but selected tools do not affect mining and weapon combat and mob simulation do not exist.
- The fixed-step loop counts animation frames but no HUD exposes a time-based rendered-FPS measurement.

## Core design

### Input, menus, glass, and item order

Use one camera-relative basis for yaw, look, and horizontal movement. Positive horizontal pointer movement must turn the view right; `D` must move along camera-right and `A` along camera-left at yaw 0 and at quarter-turn headings. Pitch remains unchanged. Add deterministic unit tests for those headings and for mouse sign.

Opening inventory or another modal first clears player input and releases pointer lock. The menu uses a normal visible system pointer and consumes no gameplay look input. Closing inventory leaves the player stationary; pointer lock is requested only from a direct user action, with the existing drag-look fallback retained where pointer lock is unavailable. Deliberately opening inventory must not be treated as pausing the game.

Keep the existing translucent render layer, but revise the glass tile and material alpha so a contrasting block behind glass is clearly visible. Verify atlas alpha values and inspect the rendered result in the browser. Maintain explicit opaque/cutout/translucent ordering and avoid depth-writing translucent surfaces.

Create one canonical ordered list of equipped hotbar item IDs. Inventory rendering places those same items first and in the same order, followed by remaining owned items in stable registry order. Persist the nine assignments per world, initialize old saves with the current default hotbar, and allow an inventory action to assign an item to the currently selected hotbar slot. Assignments reference the existing count-map inventory and do not duplicate counts; one item ID can occupy at most one hotbar slot, and assigning it again moves it from its prior slot. Empty or no-longer-owned assignments render as empty.

### World catalog and local saves

Add a small client-side world catalog with stable world IDs, display names, seeds, and per-world save keys. The title flow lists existing worlds, resumes a selected world, and creates a new named world with an entered or generated seed. Add an explicit **Save & New World** action: flush the current world successfully, preserve it in the catalog, return to world selection, and open the new-world form. If saving fails, stay in the current world and explain the failure; never start the new world by overwriting the previous one. Keep the current compact local save representation. On first startup after the change, migrate the existing single save into one default catalog entry without losing its seed, player, inventory, time, hotbar assignments, tool durability, or block mutations. Migrate the save envelope to a new version with a decoder for the existing version. Validate catalog and save data before constructing a world. Switching worlds disposes the old game instance and its worker/render resources before opening the next one. Deletion, export, accounts, cloud saves, and world sharing beyond the later online room are not part of this change.

### Tools and weapons

Extend the data-driven item definitions and recipes so wood-, stone-, and iron-tier tools can be assigned to a hotbar slot. A matching tool class and sufficient tier reduce mining time; an insufficient tool must not create a drop from blocks that require a stronger tool. Add craftable melee weapons with per-item attack strength and cooldown. Tool/weapon use changes inventory and game state through the existing atomic mutation path. Durability is tracked per owned tool/weapon item and saved; these non-stackable items have a maximum count of one per item definition in the initial implementation. Keep recipes and icons in the existing registries/atlas.

### Mobs and spawn restrictions

Add two visually distinct, original, simple hostile mob types with bounded health, movement, attack cooldown, and drop definitions. Mobs are domain records independent of Three.js objects; rendering observes that state. AI is limited to short-range pursuit and melee, without pathfinding, breeding, equipment, or complex animation.

Surface spawns are allowed only during the night phase. Cave spawns are allowed at any world time only at a valid underground floor position with solid overhead terrain and no vertical sky exposure. Daytime open-surface candidates must always be rejected. Spawn checks run on a bounded timer and only near loaded chunks; cap the active population at 12 total, with a small per-chunk cap and a minimum distance from the player. Pause stops mob simulation. Tests cover day/night, roof/sky exposure, invalid floor/collision, distance, population bounds, and deterministic command results.

### Hotbar wheel and FPS

Wheel up/down selects the previous/next of the nine hotbar slots with wraparound, only while gameplay is active. Prevent page scrolling over the active game viewport, but do not consume wheel input in inventory or other scrollable menus. Number keys and click selection continue to work.

The HUD displays real rendered FPS, sampled from `requestAnimationFrame` timestamps over a rolling one-second window, not from fixed simulation ticks or a guessed constant. Define behavior during tab suspension and pause (show an idle marker or zero rather than stale FPS). Test the sampler with controlled timestamps and verify the counter changes in a running browser.

## Multiplayer architecture

Use a host-authoritative WebRTC star for up to four participants total. The host browser owns the active world, save, simulation, mobs, and validation of all remote actions. Guests send bounded movement/action requests and render host-approved state. All peers must agree on protocol, content, and generator versions before joining. Terrain is generated locally from the shared seed/version; the host sends initial player state and authoritative world mutations. Host departure closes the room and guests receive a clear disconnect message; no world is uploaded or saved on a game server.

Use browser `RTCPeerConnection` and `RTCDataChannel` for game traffic. A separately deployable WebSocket signaling service creates short-lived private rooms and forwards only join negotiation data (SDP and ICE candidates); it does not store world saves or game state. Use a reliable ordered channel for room setup, join snapshots, block/inventory mutations, and other critical commands; use a bounded low-latency channel for transient player poses. The host must explicitly accept each join. Room codes are unguessable, short-lived, and rate-limited.

Configure STUN/TURN endpoints at runtime through deployment configuration; do not embed long-lived credentials in the static client. STUN/direct ICE connections are attempted first. TURN is available as a relay fallback for networks that block direct connectivity. Internet multiplayer requires an HTTPS-hosted game and a public WSS signaling endpoint; reliable joining across restrictive networks also requires a reachable TURN service with temporary credentials. The signaling service can be self-hosted independently of the game site. No ChatGPT-hosted service is required or assumed.

The room is private/invite-only, capped at four players, and has no public browser or accounts. Direct peer connections can reveal network candidate information to other room participants; provide a relay-only configuration for operators who prefer to route game data through TURN, noting the additional bandwidth requirement. Validate message schema, size, rate, world identity, entity/action reach, and item/block IDs on the host. Reject incompatible clients and malformed or oversized packets without mutating world state.

### Multiplayer alternatives considered

- **Recommended: host-authoritative WebRTC star.** Keeps world ownership and persistence in the host browser, supports friends on different networks, and needs only a small signaling service plus TURN fallback. Limitation: the host must remain online, and service configuration/deployment is necessary for internet joins.
- **Dedicated authoritative game server.** Better if worlds must remain online without the player or rooms need to scale, but requires server simulation, persistence, deployment, and more operational cost than this small private game needs.
- **LAN/port-forwarded direct server.** Works for a local-network test and may avoid a relay, but router/firewall/NAT configuration is inconsistent and is not the default internet-join experience.

WebRTC supplies peer data channels but not application signaling. ICE uses STUN/TURN candidates to establish a connection, and TURN relays traffic when a direct route is unavailable. These are runtime infrastructure requirements, not a limitation of browser multiplayer itself. References: [WebRTC peer connections and signaling](https://webrtc.org/getting-started/peer-connections), [WebRTC TURN server](https://webrtc.org/getting-started/turn-server), [MDN RTCDataChannel](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel), and [MDN WebRTC protocols](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols).

## Failure behavior and hosting boundary

- If pointer lock is unavailable or denied, gameplay remains usable through the fallback controller and the menu pointer remains visible.
- A corrupt catalog entry, old save, or per-world quota failure reports the affected world and never silently replaces another world.
- If WebRTC, signaling, or TURN is unavailable, the single-player game remains playable and the join screen explains which network configuration is missing.
- If a guest disconnects, the host continues. If the host disconnects, guests are told the room ended; there is no authority migration.
- Repository work includes the self-hostable signaling component, client configuration, local integration tests, and deployment/join instructions. Actual public internet acceptance is only claimed after the signaling/TURN endpoint is deployed and tested from separate networks. Choosing a hosting account/provider and publishing services requires the user's deployment choice and credentials; do not publish to ChatGPT Sites.

## Specifications to update with implementation

The implementation must reconcile the existing first-release exclusions and milestone list with this newly approved scope: update `AGENTS.md`, `docs/GAME_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/TESTING.md`, and `DECISIONS.md`. Preserve their still-applicable constraints; explicitly replace the old exclusions for multiplayer, mobs, and combat, and record the client-hosted WebRTC decision and its limitations rather than silently leaving contradictory instructions.

## Verification and acceptance

1. Unit tests cover input signs and camera-relative strafing; inventory pointer-lock transitions; glass alpha/mesh-layer behavior; shared ordering and hotbar wheel wraparound; world catalog migration and isolation; mining tool eligibility/speed and durability; weapon damage/cooldown; cave/night spawn rules and population caps; and elapsed-time FPS sampling.
2. Existing quality gates pass after each implementation stage: format, lint, typecheck, unit tests, production build, and diff validation. Browser tests cover visible cursor and frozen look in inventory, visible glass transmission, aligned inventory/hotbar items, creating/switching/reloading worlds, crafting/equipping tools, combat, and wheel selection.
3. A local signaling integration test uses two independent browser contexts to create a room, accept a guest, exchange authoritative state, reject invalid commands, and handle disconnects.
4. Cross-network acceptance uses the deployed HTTPS client and public WSS/TURN configuration from two separate internet connections. Without that infrastructure, report only the verified local integration result and list the remaining deployment requirement.

## Final hosting and resource handoff

After implementation, report a current external static-hosting option and a self-hostable option for signaling/TURN, with current source-linked operational requirements. Separate static-site delivery, signaling, TURN relay bandwidth, and the player-host browser; do not imply that a small signaling VM performs the game simulation. Give practical hardware/network estimates for one local player and a four-player host, label estimates as estimates, and explain that latency depends on the host's upload and players' routes. Measure the running local app where available: browser-reported JavaScript heap, saved-origin storage, built asset size, and (if the OS exposes it) process RSS. Clearly distinguish these from total browser/GPU memory and avoid reporting unsupported precision.

## Explicit non-goals

More than four players, public matchmaking, accounts, voice/text chat, host migration, cloud-persistent worlds, dedicated-server authority, complex mob AI, advanced creature animation, and guaranteed connectivity through an unconfigured relay are excluded. The client and signaling service must remain deployable outside ChatGPT hosting.
