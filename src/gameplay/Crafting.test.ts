import { describe, expect, it } from 'vitest';
import { BLOCK_ID } from '../world/defaultBlocks';
import { DEFAULT_ITEM_DEFINITIONS, ITEM_ID } from '../world/ItemRegistry';
import { WorldMutationStore } from '../world/MutationBatch';
import { canCraftRecipe, craftRecipe } from './Crafting';
import { CRAFTING_RECIPES } from './recipes';
import { CHUNK_VOLUME } from '../shared/coordinates';

function inventoryStore(items: ReadonlyMap<number, number>): WorldMutationStore {
  return new WorldMutationStore(
    { x: 0, z: 0 },
    new Uint16Array(CHUNK_VOLUME),
    DEFAULT_ITEM_DEFINITIONS.map((item) => ({
      id: item.id,
      placeable: item.kind === 'block',
      maxStack: item.maxStack,
    })),
    items,
  );
}

describe('data-driven crafting', () => {
  it('turns logs into planks atomically', () => {
    const store = inventoryStore(new Map([[BLOCK_ID['oak_log'] ?? 0, 2]]));
    expect(canCraftRecipe(store, 'oak-planks')).toBe(true);
    expect(craftRecipe(store, 'oak-planks')).toBe(true);
    expect(store.getItemCount(BLOCK_ID['oak_log'] ?? 0)).toBe(1);
    expect(store.getItemCount(BLOCK_ID['oak_planks'] ?? 0)).toBe(4);
    expect(store.revision).toBe(1);
  });

  it('does not consume ingredients when the recipe is unavailable', () => {
    const store = inventoryStore(new Map([[BLOCK_ID['oak_log'] ?? 0, 1]]));
    expect(canCraftRecipe(store, 'iron-pickaxe')).toBe(false);
    expect(craftRecipe(store, 'iron-pickaxe')).toBe(false);
    expect(store.getItemCount(BLOCK_ID['oak_log'] ?? 0)).toBe(1);
    expect(store.revision).toBe(0);
  });

  it('includes the complete early-game material progression', () => {
    expect(CRAFTING_RECIPES.map((recipe) => recipe.id)).toEqual(
      expect.arrayContaining([
        'sticks',
        'crafting-station',
        'wooden-pickaxe',
        'stone-pickaxe',
        'furnace',
        'smelt-iron',
        'iron-pickaxe',
      ]),
    );
    expect(ITEM_ID['stick']).toBeGreaterThan(0);
  });
});
