import type { ToolClass, ToolTier } from './BlockRegistry';
import { BLOCK_ID, DEFAULT_BLOCK_DEFINITIONS } from './defaultBlocks';

export type ItemKind = 'block' | 'material' | 'tool' | 'weapon';

export interface ItemDefinition {
  readonly id: number;
  readonly key: string;
  readonly displayName: string;
  readonly iconKey: string;
  readonly kind: ItemKind;
  readonly maxStack?: number;
  readonly toolClass?: ToolClass;
  readonly tier?: ToolTier;
  readonly miningMultiplier?: number;
  readonly attackDamage?: number;
  readonly maxDurability?: number;
}

export class ItemRegistry {
  private readonly byId = new Map<number, ItemDefinition>();
  private readonly byKey = new Map<string, ItemDefinition>();

  constructor(definitions: readonly ItemDefinition[]) {
    if (definitions.length === 0) throw new RangeError('Item registry cannot be empty');
    for (const item of definitions) {
      if (!Number.isSafeInteger(item.id) || item.id < 0 || item.id > 65_535)
        throw new RangeError(`Item ID is outside the supported range: ${item.id}`);
      if (
        !/^[a-z0-9_-]+:[a-z0-9_./-]+$/.test(item.key) ||
        !item.displayName.trim() ||
        !item.iconKey.trim()
      )
        throw new RangeError(`Item metadata is invalid: ${item.key}`);
      if (this.byId.has(item.id) || this.byKey.has(item.key))
        throw new RangeError(`Duplicate item ID or key: ${item.key}`);
      if (item.kind === 'tool' && (!item.toolClass || !item.tier || item.tier === 'hand'))
        throw new RangeError(`Tool ${item.key} must declare a class and tier`);
      if (
        (item.kind === 'tool' || item.kind === 'weapon') &&
        (!Number.isSafeInteger(item.maxDurability) || (item.maxDurability ?? 0) < 1)
      )
        throw new RangeError(`Gear ${item.key} must declare positive integer durability`);
      const maxStack = item.maxStack ?? (item.kind === 'tool' || item.kind === 'weapon' ? 1 : 64);
      if (
        !Number.isSafeInteger(maxStack) ||
        maxStack < 1 ||
        maxStack > 99 ||
        ((item.kind === 'tool' || item.kind === 'weapon') && maxStack !== 1)
      )
        throw new RangeError(`Item ${item.key} has an invalid stack limit`);
      if (
        item.kind === 'tool' &&
        (typeof item.miningMultiplier !== 'number' ||
          !Number.isFinite(item.miningMultiplier) ||
          item.miningMultiplier <= 1)
      )
        throw new RangeError(`Tool ${item.key} must declare a mining multiplier greater than 1`);
      if (
        item.kind === 'weapon' &&
        (typeof item.attackDamage !== 'number' ||
          !Number.isFinite(item.attackDamage) ||
          item.attackDamage <= 0)
      )
        throw new RangeError(`Weapon ${item.key} must declare positive attack damage`);
      const frozen = Object.freeze({ ...item, maxStack });
      this.byId.set(frozen.id, frozen);
      this.byKey.set(frozen.key, frozen);
    }
  }

  get(id: number): ItemDefinition {
    const item = this.byId.get(id);
    if (!item) throw new RangeError(`Unknown item ID: ${id}`);
    return item;
  }

  getByKey(key: string): ItemDefinition {
    const item = this.byKey.get(key);
    if (!item) throw new RangeError(`Unknown item key: ${key}`);
    return item;
  }

  list(): readonly ItemDefinition[] {
    return [...this.byId.values()].sort((left, right) => left.id - right.id);
  }
}

const extraItems: readonly ItemDefinition[] = [
  {
    id: 1001,
    key: 'stonefield:stick',
    displayName: 'Stick',
    iconKey: 'stick',
    kind: 'material',
  },
  {
    id: 1002,
    key: 'stonefield:wooden_pickaxe',
    displayName: 'Wooden pickaxe',
    iconKey: 'wooden_pickaxe',
    kind: 'tool',
    toolClass: 'pickaxe',
    tier: 'wood',
    miningMultiplier: 2.2,
    maxDurability: 60,
  },
  {
    id: 1003,
    key: 'stonefield:wooden_axe',
    displayName: 'Wooden axe',
    iconKey: 'wooden_axe',
    kind: 'tool',
    toolClass: 'axe',
    tier: 'wood',
    miningMultiplier: 2.2,
    maxDurability: 60,
  },
  {
    id: 1004,
    key: 'stonefield:wooden_shovel',
    displayName: 'Wooden shovel',
    iconKey: 'wooden_shovel',
    kind: 'tool',
    toolClass: 'shovel',
    tier: 'wood',
    miningMultiplier: 2.2,
    maxDurability: 60,
  },
  {
    id: 1005,
    key: 'stonefield:stone_pickaxe',
    displayName: 'Stone pickaxe',
    iconKey: 'stone_pickaxe',
    kind: 'tool',
    toolClass: 'pickaxe',
    tier: 'stone',
    miningMultiplier: 3.6,
    maxDurability: 132,
  },
  {
    id: 1006,
    key: 'stonefield:stone_axe',
    displayName: 'Stone axe',
    iconKey: 'stone_axe',
    kind: 'tool',
    toolClass: 'axe',
    tier: 'stone',
    miningMultiplier: 3.6,
    maxDurability: 132,
  },
  {
    id: 1007,
    key: 'stonefield:stone_shovel',
    displayName: 'Stone shovel',
    iconKey: 'stone_shovel',
    kind: 'tool',
    toolClass: 'shovel',
    tier: 'stone',
    miningMultiplier: 3.6,
    maxDurability: 132,
  },
  {
    id: 1008,
    key: 'stonefield:iron_ingot',
    displayName: 'Iron ingot',
    iconKey: 'iron_ingot',
    kind: 'material',
  },
  {
    id: 1009,
    key: 'stonefield:iron_pickaxe',
    displayName: 'Iron pickaxe',
    iconKey: 'iron_pickaxe',
    kind: 'tool',
    toolClass: 'pickaxe',
    tier: 'iron',
    miningMultiplier: 5.2,
    maxDurability: 250,
  },
  {
    id: 1011,
    key: 'stonefield:iron_axe',
    displayName: 'Iron axe',
    iconKey: 'iron_axe',
    kind: 'tool',
    toolClass: 'axe',
    tier: 'iron',
    miningMultiplier: 5.2,
    maxDurability: 250,
  },
  {
    id: 1012,
    key: 'stonefield:iron_shovel',
    displayName: 'Iron shovel',
    iconKey: 'iron_shovel',
    kind: 'tool',
    toolClass: 'shovel',
    tier: 'iron',
    miningMultiplier: 5.2,
    maxDurability: 250,
  },
  {
    id: 1010,
    key: 'stonefield:berries',
    displayName: 'Wild berries',
    iconKey: 'berries',
    kind: 'material',
  },
  {
    id: 1013,
    key: 'stonefield:wooden_sword',
    displayName: 'Wooden sword',
    iconKey: 'wooden_sword',
    kind: 'weapon',
    attackDamage: 4,
    maxDurability: 100,
  },
  {
    id: 1014,
    key: 'stonefield:stone_sword',
    displayName: 'Stone sword',
    iconKey: 'stone_sword',
    kind: 'weapon',
    attackDamage: 5,
    maxDurability: 175,
  },
  {
    id: 1015,
    key: 'stonefield:iron_sword',
    displayName: 'Iron sword',
    iconKey: 'iron_sword',
    kind: 'weapon',
    attackDamage: 7,
    maxDurability: 250,
  },
];

export const DEFAULT_ITEM_DEFINITIONS: readonly ItemDefinition[] = Object.freeze([
  ...DEFAULT_BLOCK_DEFINITIONS.map((block): ItemDefinition => ({
    id: block.id,
    key: block.key,
    displayName: block.displayName,
    iconKey: block.textures.top,
    kind: 'block',
    maxStack: 64,
  })),
  ...extraItems.map((item) => ({
    ...item,
    maxStack: item.maxStack ?? (item.kind === 'tool' || item.kind === 'weapon' ? 1 : 64),
  })),
]);

export const DEFAULT_ITEMS = new ItemRegistry(DEFAULT_ITEM_DEFINITIONS);
export const ITEM_ID = Object.freeze(
  Object.fromEntries(
    DEFAULT_ITEM_DEFINITIONS.map((item) => [item.key.slice('stonefield:'.length), item.id]),
  ) as Record<string, number>,
);

export const DEFAULT_HOTBAR_ITEM_IDS = Object.freeze([
  BLOCK_ID['dirt'] ?? 0,
  BLOCK_ID['stone'] ?? 0,
  BLOCK_ID['oak_planks'] ?? 0,
  BLOCK_ID['cobblestone'] ?? 0,
  BLOCK_ID['glass'] ?? 0,
  BLOCK_ID['torch'] ?? 0,
  BLOCK_ID['oak_log'] ?? 0,
  BLOCK_ID['sand'] ?? 0,
  BLOCK_ID['oak_leaves'] ?? 0,
]);
