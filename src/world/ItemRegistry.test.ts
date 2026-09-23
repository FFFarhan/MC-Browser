import { describe, expect, it } from 'vitest';
import { createAtlasPixels } from '../rendering/TextureAtlas';
import { CRAFTING_RECIPES } from '../gameplay/recipes';
import { DEFAULT_ITEMS, ITEM_ID, ItemRegistry, type ItemDefinition } from './ItemRegistry';

describe('data-driven tool and weapon catalog', () => {
  it('provides original atlas icons and required stats for every tool and weapon', () => {
    const atlas = createAtlasPixels('gear-icons');
    const gear = DEFAULT_ITEMS.list().filter(
      (item) => item.kind === 'tool' || item.kind === 'weapon',
    );
    expect(gear.map((item) => item.key)).toEqual(
      expect.arrayContaining([
        'stonefield:wooden_pickaxe',
        'stonefield:stone_pickaxe',
        'stonefield:iron_pickaxe',
        'stonefield:wooden_sword',
        'stonefield:stone_sword',
        'stonefield:iron_sword',
      ]),
    );
    for (const item of gear) {
      expect(atlas.manifest.entries[item.iconKey], item.key).toBeDefined();
      expect(item.maxDurability, item.key).toBeGreaterThan(0);
      if (item.kind === 'tool') expect(item.miningMultiplier, item.key).toBeGreaterThan(1);
      else expect(item.attackDamage, item.key).toBeGreaterThan(0);
    }
  });

  it('rejects tools and weapons that omit their required behavior data', () => {
    const brokenTool: ItemDefinition = {
      id: 65_000,
      key: 'test:broken_tool',
      displayName: 'Broken tool',
      iconKey: 'stone',
      kind: 'tool',
      toolClass: 'pickaxe',
      tier: 'wood',
    };
    const brokenWeapon: ItemDefinition = {
      id: 65_001,
      key: 'test:broken_weapon',
      displayName: 'Broken weapon',
      iconKey: 'stone',
      kind: 'weapon',
    };
    expect(() => new ItemRegistry([brokenTool])).toThrow(RangeError);
    expect(() => new ItemRegistry([brokenWeapon])).toThrow(RangeError);
    expect(ITEM_ID['iron_sword']).toBeDefined();
    expect(CRAFTING_RECIPES.map((recipe) => recipe.id)).toEqual(
      expect.arrayContaining(['wooden-sword', 'stone-sword', 'iron-sword']),
    );
  });
});
