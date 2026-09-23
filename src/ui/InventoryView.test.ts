import { afterEach, describe, expect, it, vi } from 'vitest';
import { BLOCK_ID } from '../world/defaultBlocks';
import { DEFAULT_HOTBAR_ITEM_IDS, DEFAULT_ITEM_DEFINITIONS, ITEM_ID } from '../world/ItemRegistry';
import { MutationBatch, WorldMutationStore } from '../world/MutationBatch';
import { CHUNK_VOLUME } from '../shared/coordinates';
import { craftRecipe } from '../gameplay/Crafting';
import { InventoryView } from './InventoryView';

describe('inventory and recipe book', () => {
  afterEach(() => document.body.replaceChildren());

  it('opens with E and crafts materials without losing items', () => {
    const logId = BLOCK_ID['oak_log'] ?? 0;
    const plankId = BLOCK_ID['oak_planks'] ?? 0;
    const world = new WorldMutationStore(
      { x: 0, z: 0 },
      new Uint16Array(CHUNK_VOLUME),
      DEFAULT_ITEM_DEFINITIONS.map((item) => ({
        id: item.id,
        placeable: item.kind === 'block',
        maxStack: item.maxStack,
      })),
      new Map([[logId, 1]]),
    );
    const inventory = new InventoryView(
      world,
      (recipeId) => craftRecipe(world, recipeId),
      () => undefined,
      undefined,
      undefined,
      (itemId) => `data:image/test,${itemId}`,
    );
    inventory.setEnabled(true);
    document.body.append(inventory.element);

    expect(inventory.element.hidden).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    expect(inventory.element.hidden).toBe(false);
    expect(inventory.element.querySelectorAll('.inventory-slot')).toHaveLength(27);
    const logSlot = inventory.element.querySelector<HTMLButtonElement>(
      `.inventory-slot[data-item-id="${logId}"]`,
    );
    expect(logSlot?.querySelector('.item-icon')?.getAttribute('style')).toContain(
      'data:image/test',
    );
    logSlot?.click();
    expect(logSlot?.getAttribute('aria-pressed')).toBe('true');
    expect(inventory.element.querySelector('[data-testid="selected-item-name"]')?.textContent).toBe(
      'Oak log',
    );
    inventory.element.querySelector<HTMLButtonElement>('[data-recipe="oak-planks"]')?.click();
    expect(world.getItemCount(logId)).toBe(0);
    expect(world.getItemCount(plankId)).toBe(4);
    expect(
      inventory.element
        .querySelector<HTMLButtonElement>(`.inventory-slot[data-item-id="${plankId}"]`)
        ?.getAttribute('aria-label'),
    ).toBe('Oak planks, 4');

    inventory.dispose();
  });

  it('lists owned hotbar items in the same order as their hotbar slots', () => {
    const inventory = new InventoryView(
      new WorldMutationStore(
        { x: 0, z: 0 },
        new Uint16Array(CHUNK_VOLUME),
        DEFAULT_ITEM_DEFINITIONS.map((item) => ({
          id: item.id,
          placeable: item.kind === 'block',
          maxStack: item.maxStack,
        })),
        new Map(DEFAULT_HOTBAR_ITEM_IDS.map((id) => [id, 1])),
      ),
      () => false,
      () => undefined,
    );
    inventory.refresh();
    const listedIds = [
      ...inventory.element.querySelectorAll<HTMLButtonElement>('.inventory-slot[data-item-id]'),
    ].map((slot) => Number(slot.dataset['itemId']));
    expect(listedIds.slice(0, DEFAULT_HOTBAR_ITEM_IDS.length)).toEqual(DEFAULT_HOTBAR_ITEM_IDS);
    inventory.dispose();
  });

  it('offers an edible item action without spending it unless use succeeds', () => {
    const berries = ITEM_ID['berries'] ?? 0;
    const world = new WorldMutationStore(
      { x: 0, z: 0 },
      new Uint16Array(CHUNK_VOLUME),
      DEFAULT_ITEM_DEFINITIONS.map((item) => ({
        id: item.id,
        placeable: item.kind === 'block',
        maxStack: item.maxStack,
      })),
      new Map([[berries, 1]]),
    );
    const inventory = new InventoryView(
      world,
      () => false,
      () => undefined,
      (itemId) => world.commit(new MutationBatch(world.revision).changeItem(itemId, -1)),
    );
    inventory.setEnabled(true);
    inventory.element
      .querySelector<HTMLButtonElement>(`.inventory-slot[data-item-id="${berries}"]`)
      ?.click();
    inventory.element.querySelector<HTMLButtonElement>('.use-item-button')?.click();
    expect(world.getItemCount(berries)).toBe(0);
    inventory.dispose();
  });

  it('assigns a selected item to the active hotbar slot through the inventory UI', () => {
    const pickaxe = ITEM_ID['wooden_pickaxe'] ?? 0;
    const assign = vi.fn(() => true);
    const world = new WorldMutationStore(
      { x: 0, z: 0 },
      new Uint16Array(CHUNK_VOLUME),
      DEFAULT_ITEM_DEFINITIONS.map((item) => ({
        id: item.id,
        placeable: item.kind === 'block',
        maxStack: item.maxStack,
      })),
      new Map([[pickaxe, 1]]),
    );
    const inventory = new InventoryView(
      world,
      () => false,
      () => undefined,
      undefined,
      undefined,
      undefined,
      assign,
    );
    inventory.setEnabled(true);
    document.body.append(inventory.element);
    inventory.element
      .querySelector<HTMLButtonElement>(`.inventory-slot[data-item-id="${pickaxe}"]`)
      ?.click();
    inventory.element.querySelector<HTMLButtonElement>('.assign-item-button')?.click();
    expect(assign).toHaveBeenCalledWith(pickaxe);
    inventory.dispose();
  });
});
