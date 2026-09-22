# Blocks, Items, and Recipes

## Registry rules

Blocks and items use stable unsigned numeric IDs stored in versioned data files. IDs are never reused after release. Human-readable keys use lowercase `namespace:name` strings. Logic refers to registry entries rather than hard-coded switch statements where data is sufficient.

## Block definition

Every block defines:

```ts
interface BlockDefinition {
  id: number;
  key: string;
  displayName: string;
  renderLayer: 'opaque' | 'cutout' | 'translucent' | 'invisible';
  collision: 'solid' | 'none' | 'liquid';
  replaceable: boolean;
  hardnessSeconds: number;
  requiredTool: ToolClass | null;
  minimumToolTier: ToolTier;
  emittedLight: number;
  textures: { top: string; bottom: string; side: string };
  dropItem: string | null;
}
```

Light values are integers `0..15`. Texture names resolve through the generated atlas manifest.

## Release block set

Air, grass, dirt, stone, sand, sandstone, snow, ice, water, oak log, oak leaves, oak planks, crafting station, furnace, coal ore, iron ore, coal block, iron block, cobblestone, glass, brick, clay, gravel, torch, tall grass, and bedrock are required. Names and texture designs must be original.

## Items and tools

Items define stable ID, key, display name, maximum stack, icon tile, optional placeable block, and optional tool data. Stackable items default to 64. Tools stack to one and define class, tier, speed multiplier, maximum durability, and attack value for future compatibility. Coal, raw iron, and iron ingots are required non-block items.

Tool classes are `none`, `axe`, `pickaxe`, and `shovel`. Tool tiers are `hand`, `wood`, `stone`, and `iron`. Durability is consumed only when a tool successfully changes a block for which it is applicable.

## Required recipes

- One log produces four planks.
- Two vertically adjacent planks produce four sticks.
- Four planks in a 2×2 square produce one crafting station.
- Eight cobblestone surrounding an empty center produce one furnace.
- Tool recipes use the conventional material-head plus sticks arrangement but must have original icons and names.
- Nine coal items produce one coal block; one coal block reverses to nine coal.

Crafting consumes ingredients and creates output as one atomic inventory transaction. Output cannot be taken if it would exceed inventory capacity after remainders are handled.

## Smelting

A furnace has one input slot, one fuel slot, and one output slot. Coal is the release-one fuel. One raw iron produces one iron ingot after ten simulation seconds and consumes one-eighth of a coal item's burn capacity. Closing the interface does not stop a loaded furnace; pausing stops its simulation. Unloading persists its slots, remaining progress, and remaining fuel time without advancing wall-clock time.

Input, fuel, progress, and output changes are atomic. Smelting pauses when the output cannot accept the result. Reloading or rapidly opening the interface must never duplicate fuel, input, or output.
