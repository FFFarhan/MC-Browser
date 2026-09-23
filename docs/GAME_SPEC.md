# Game Specification

## Product goal

Create an original, desktop-first voxel survival game that launches in a browser and supports a playable early-game loop: create a seeded world, explore, mine and place blocks, craft/equip tools, manage basic health and hunger, experience day and night, and save/reopen named worlds. The current build is a working first pass, not a claim that every long-term system below is complete.

## Release audience

The target is keyboard-and-mouse desktop browsers. Single-player runs from static files and remains local to the browser. Optional online rooms require public HTTPS/WSS signaling and STUN/TURN configuration; see `MULTIPLAYER_HOSTING.md`. Hosting multiplayer does not require ChatGPT services.

## Controls

- Mouse: look
- Left mouse: hold to mine
- Right mouse: place or use
- W/A/S/D: move
- Space: jump or swim upward
- Shift: sprint
- C: crouch
- E: inventory
- Escape: pause and release pointer lock
- 1–9 and mouse wheel: select hotbar slot
- F3: diagnostics overlay

Controls use the listed keyboard and mouse bindings; rebinding is a future improvement.

## World content

- Effectively unbounded horizontal terrain
- Plains, forest, desert, mountains, snow, and ocean biomes
- Caves and ore veins
- Trees and simple vegetation
- At least 25 registered blocks
- Solid, transparent, emissive, and liquid block behaviors
- Original procedural pixel-art textures
- Deterministic generation from a user-visible seed

## Player

The player has first-person movement, an AABB collider, gravity, jumping, sprinting, crouching, swimming, fall damage, 20 health points, and 20 hunger points. Hunger drains through activity. Sufficient hunger permits slow regeneration; empty hunger causes bounded starvation damage that cannot reduce health below one point in the normal difficulty used for release one.

The current survival pass tracks health, hunger, fall damage, and respawn. Death drops, persistent dropped-item timers, and a complete difficulty system are not implemented yet.

## Interaction

The player can target blocks within five blocks using voxel-grid ray traversal. Mining duration depends on block hardness and held-tool effectiveness. Completed mining creates a drop if the tool requirement is satisfied. Placement targets the adjacent cell, consumes one item only after a successful placement, and cannot overlap the player or replace a non-replaceable block.

## Inventory and crafting

The current interactive inventory shows item icons and data-driven recipes, supports hotbar assignment, and includes early wood/stone/iron tool and weapon progression. Full stack-splitting gestures and every full-game inventory operation remain future work.

Recipes are data-driven and include the early wood/stone/iron tool and weapon progression. Station-gated 3×3 crafting and furnace smelting remain future work.

## Survival world systems

- A 20-minute full day/night cycle
- Sky, fog, ambient light, and sun direction derived from world time
- Basic daylight/sky changes and transparent glass
- Hostile creatures are limited to night surface and valid caves
- Full propagated block lighting, flowing water, and procedural audio are not implemented in this working build

## Menus

The world picker supports creating and opening named seeded worlds; **Save & New World** preserves the current world before opening a new-world form. Export/import and advanced settings are not included in the current working build.

Settings include render distance, field of view, mouse sensitivity, graphics quality, master/effects/music volume, key bindings, and reduced motion.

## Save behavior

Each named world saves locally in browser storage, autosaves during play, and can be explicitly saved before creating another world. Saves contain the seed, player state, inventory/hotbar/equipment, clock, survival state, and block mutations; they are not uploaded to the signaling service. A failed write is reported instead of replacing a different world.

## Accessibility

- All menus are keyboard operable.
- Focus is visible and contained correctly in modal dialogs.
- UI does not depend on color alone.
- Text remains readable at browser zoom up to 200%.
- Reduced motion disables camera bob and reduces nonessential particles.
- Audio is optional and individually adjustable.

## Current multiplayer boundary

The optional online mode is host-authoritative WebRTC for up to four participants total. The host browser owns simulation and saves; guests send validated action/pose requests. A self-hostable signaling service and TURN configuration are included, but must be deployed publicly before people on different networks can join reliably. There is no dedicated game server or host migration. Details and starting hardware estimates are in `MULTIPLAYER_HOSTING.md`.

## Explicit exclusions for the current build

More than four players, public matchmaking, accounts, voice/text chat, dedicated-server authority, host migration, cloud saves, complex creature AI, weather, villages, automation circuits, dimensions, portals, enchanting, mobile controls, modding, shader packs, and full-game production hardening are outside this working release.
