import {
  BlockRegistry,
  type BlockDefinition,
  type BlockRenderLayer,
  type ToolClass,
  type ToolTier,
} from './BlockRegistry';

const rows: readonly [
  string,
  string,
  (BlockRenderLayer | undefined)?,
  (string | undefined)?,
  (ToolClass | null)?,
  (ToolTier | undefined)?,
  (number | undefined)?,
][] = [
  ['air', 'Air', 'invisible', 'air', null],
  ['grass', 'Grass', undefined, 'grass_side', 'shovel'],
  ['dirt', 'Dirt', undefined, 'dirt', 'shovel'],
  ['stone', 'Stone', undefined, 'stone', 'pickaxe', 'wood'],
  ['sand', 'Sand', undefined, 'sand', 'shovel'],
  ['sandstone', 'Sandstone', undefined, 'sandstone', 'pickaxe', 'wood'],
  ['snow', 'Snow', undefined, 'snow', 'shovel'],
  ['ice', 'Ice', 'translucent', 'ice'],
  ['water', 'Water', 'translucent', 'water_0'],
  ['oak_log', 'Oak log', undefined, 'oak_log_side', 'axe'],
  ['oak_leaves', 'Oak leaves', 'cutout', 'oak_leaves', 'axe'],
  ['oak_planks', 'Oak planks', undefined, 'oak_planks', 'axe'],
  ['crafting_station', 'Crafting station', undefined, 'crafting_side', 'axe'],
  ['furnace', 'Furnace', undefined, 'furnace_side', 'pickaxe', 'wood'],
  ['coal_ore', 'Coal ore', undefined, 'coal_ore', 'pickaxe', 'wood'],
  ['iron_ore', 'Iron ore', undefined, 'iron_ore', 'pickaxe', 'stone'],
  ['coal_block', 'Coal block', undefined, 'coal_block', 'pickaxe', 'wood'],
  ['iron_block', 'Iron block', undefined, 'iron_block', 'pickaxe', 'stone'],
  ['cobblestone', 'Cobblestone', undefined, 'cobblestone', 'pickaxe', 'wood'],
  ['glass', 'Glass', 'translucent', 'glass'],
  ['brick', 'Brick', undefined, 'brick', 'pickaxe', 'wood'],
  ['clay', 'Clay', undefined, 'clay', 'shovel'],
  ['gravel', 'Gravel', undefined, 'gravel', 'shovel'],
  ['torch', 'Torch', 'cutout', 'torch', null],
  ['tall_grass', 'Tall grass', 'cutout', 'tall_grass', null],
  ['bedrock', 'Bedrock', undefined, 'bedrock', null],
];

export const DEFAULT_BLOCK_DEFINITIONS: readonly BlockDefinition[] = Object.freeze(
  rows.map(
    ([name, displayName, layer = 'opaque', texture, tool = null, tier = 'hand', hardness], id) => {
      const tile = texture ?? name;
      const hardnessSeconds =
        hardness ??
        (
          {
            air: 0,
            grass: 0.32,
            dirt: 0.45,
            stone: 1.65,
            sand: 0.34,
            sandstone: 1.15,
            snow: 0.2,
            ice: 0.72,
            water: 0,
            oak_log: 1.05,
            oak_leaves: 0.18,
            oak_planks: 0.78,
            crafting_station: 0.92,
            furnace: 1.45,
            coal_ore: 1.85,
            iron_ore: 2.25,
            coal_block: 2.6,
            iron_block: 3.25,
            cobblestone: 1.72,
            glass: 0.25,
            brick: 1.35,
            clay: 0.5,
            gravel: 0.38,
            torch: 0.08,
            tall_grass: 0,
            bedrock: 0,
          } as Record<string, number>
        )[name] ??
        1;
      const textures =
        name === 'grass'
          ? { top: 'grass_top', bottom: 'dirt', side: 'grass_side' }
          : name === 'oak_log'
            ? { top: 'oak_log_end', bottom: 'oak_log_end', side: 'oak_log_side' }
            : name === 'crafting_station'
              ? { top: 'crafting_top', bottom: 'oak_planks', side: 'crafting_side' }
              : name === 'furnace'
                ? { top: 'furnace_side', bottom: 'furnace_side', side: 'furnace_side' }
                : { top: tile, bottom: tile, side: tile };
      return {
        id,
        key: `stonefield:${name}`,
        displayName,
        renderLayer: layer,
        collision:
          name === 'air' || layer === 'cutout'
            ? 'none'
            : layer === 'translucent' && name === 'water'
              ? 'liquid'
              : 'solid',
        replaceable: ['air', 'water', 'tall_grass'].includes(name),
        hardnessSeconds,
        requiredTool: tool,
        minimumToolTier: tier,
        emittedLight: name === 'torch' ? 14 : 0,
        textures,
        dropItem:
          name === 'air' || name === 'water' || name === 'tall_grass' ? null : `stonefield:${name}`,
      } satisfies BlockDefinition;
    },
  ),
);

export const DEFAULT_BLOCKS = new BlockRegistry(DEFAULT_BLOCK_DEFINITIONS);
export const BLOCK_ID = Object.freeze(
  Object.fromEntries(
    DEFAULT_BLOCK_DEFINITIONS.map((block) => [block.key.slice('stonefield:'.length), block.id]),
  ) as Record<string, number>,
);
