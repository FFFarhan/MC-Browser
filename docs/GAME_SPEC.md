# Game Specification

## Product goal

Create a polished, original, desktop-first voxel survival game that launches quickly in a browser and supports a complete early-game loop: create a seeded world, explore, gather wood and stone, craft tools, mine ore, build, manage health and hunger, experience day and night, save, and return later.

## Release audience

The first release is for keyboard-and-mouse players on current stable desktop Chrome, Firefox, and Safari. It must run from a static host and must remain playable offline after its files have loaded.

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

All gameplay bindings are rebindable. Browser-reserved combinations may be rejected with an explanation.

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

On death, the player drops inventory items at the death location and respawns at the original safe spawn with full health and hunger. Dropped items expire after five loaded minutes. If the death area is not loaded, expiration time does not advance.

## Interaction

The player can target blocks within five blocks using voxel-grid ray traversal. Mining duration depends on block hardness and held-tool effectiveness. Completed mining creates a drop if the tool requirement is satisfied. Placement targets the adjacent cell, consumes one item only after a successful placement, and cannot overlap the player or replace a non-replaceable block.

## Inventory and crafting

The inventory contains 27 storage slots and a nine-slot hotbar. It supports drag, swap, stack merge, half-stack split, single-item placement, shift transfer, number-key hotbar transfer, and tooltips. Every inventory transaction is atomic: items are neither duplicated nor lost.

Release-one crafting includes a 2×2 player grid and 3×3 crafting-station grid. Recipes are data-driven and support shaped and shapeless matching. A furnace converts raw iron to iron ingots using coal while its chunk is loaded. The progression includes wood, planks, sticks, a crafting station, wooden tools, stone tools, a furnace, and iron-grade tools.

## Survival world systems

- A 20-minute full day/night cycle
- Sky, fog, ambient light, and sun direction derived from world time
- Sunlight and block-emitted voxel light
- Transparent water with bounded level-based spreading
- Original procedural sound effects for movement and core interactions
- Particles for block breaking, pickup, damage, and water entry

## Menus

The title screen supports creating, loading, exporting, importing, and deleting worlds. World creation accepts a name and optional seed. The pause menu offers resume, settings, save, return to title, and export. Deletion requires explicit confirmation naming the world.

Settings include render distance, field of view, mouse sensitivity, graphics quality, master/effects/music volume, key bindings, and reduced motion.

## Save behavior

Autosave occurs at least every 30 seconds when changes exist, on pause, and before returning to the title screen. A save includes world metadata, generator version, mutations, player state, inventory, world time, dropped items in persisted changed regions, and settings. Refreshing or closing during a save must not invalidate the last committed state.

## Accessibility

- All menus are keyboard operable.
- Focus is visible and contained correctly in modal dialogs.
- UI does not depend on color alone.
- Text remains readable at browser zoom up to 200%.
- Reduced motion disables camera bob and reduces nonessential particles.
- Audio is optional and individually adjustable.

## Explicit exclusions

Multiplayer, hostile or passive mobs, combat, weather, villages, automation circuits, dimensions, portals, enchanting, accounts, cloud saves, mobile controls, modding, and shader packs are not part of release one.
