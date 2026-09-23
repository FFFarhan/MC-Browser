import { describe, expect, it } from 'vitest';
import { BLOCK_ID, DEFAULT_BLOCKS } from '../world/defaultBlocks';
import { ITEM_ID } from '../world/ItemRegistry';
import {
  applyDurability,
  attackWithMelee,
  attackWithWeapon,
  createEquipmentState,
  evaluateMiningTool,
} from './Equipment';

describe('equipment rules', () => {
  it('speeds up matching tools by tier and blocks drops below the required tier', () => {
    const stone = DEFAULT_BLOCKS.get(BLOCK_ID['stone'] ?? 0);
    const ironOre = DEFAULT_BLOCKS.get(BLOCK_ID['iron_ore'] ?? 0);
    expect(evaluateMiningTool(stone, null)).toEqual({ speedMultiplier: 1, dropAllowed: false });
    expect(evaluateMiningTool(stone, ITEM_ID['wooden_pickaxe'] ?? 0)).toMatchObject({
      speedMultiplier: expect.any(Number),
      dropAllowed: true,
    });
    expect(evaluateMiningTool(ironOre, ITEM_ID['wooden_pickaxe'] ?? 0).dropAllowed).toBe(false);
    expect(evaluateMiningTool(ironOre, ITEM_ID['stone_pickaxe'] ?? 0).dropAllowed).toBe(true);
    expect(evaluateMiningTool(ironOre, ITEM_ID['stone_axe'] ?? 0).dropAllowed).toBe(false);
  });

  it('decrements tool durability and reports a break without mutating the previous state', () => {
    const itemId = ITEM_ID['wooden_pickaxe'] ?? 0;
    const original = createEquipmentState();
    const first = applyDurability(original, itemId, 1);
    expect(first.remaining).toBe(59);
    expect(first.broken).toBe(false);
    expect(original.durability.has(itemId)).toBe(false);
    const final = applyDurability(createEquipmentState([{ itemId, remaining: 1 }]), itemId, 1);
    expect(final.broken).toBe(true);
    expect(final.state.durability.has(itemId)).toBe(false);
  });

  it('applies weapon damage only off cooldown and wears weapons on a successful attack', () => {
    const weapon = ITEM_ID['wooden_sword'] ?? 0;
    const initial = createEquipmentState();
    const hit = attackWithWeapon(initial, weapon, 1_000);
    expect(hit).toMatchObject({ accepted: true, damage: 4, remaining: 99 });
    expect(attackWithWeapon(hit.state, weapon, 1_200)).toMatchObject({
      accepted: false,
      damage: 0,
    });
    expect(attackWithWeapon(hit.state, weapon, 1_600).accepted).toBe(true);
  });

  it('allows an unarmed melee attack without consuming an item', () => {
    const initial = createEquipmentState();
    const hit = attackWithMelee(initial, null, 1_000);
    expect(hit).toMatchObject({ accepted: true, damage: 1, broken: false, remaining: 0 });
    expect(hit.state.durability.size).toBe(0);
    expect(attackWithMelee(hit.state, null, 1_200).accepted).toBe(false);
    expect(attackWithMelee(hit.state, null, 1_500).accepted).toBe(true);
  });
});
