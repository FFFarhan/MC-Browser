import { afterEach, describe, expect, it } from 'vitest';
import { CHUNK_VOLUME } from '../shared/coordinates';
import { BLOCK_ID } from '../world/defaultBlocks';
import { DEFAULT_ITEM_DEFINITIONS } from '../world/ItemRegistry';
import { DEFAULT_HOTBAR_ITEM_IDS } from '../world/ItemRegistry';
import { WorldMutationStore } from '../world/MutationBatch';
import { HotbarView } from './HotbarView';

describe('icon hotbar', () => {
  afterEach(() => document.body.replaceChildren());

  it('shows a textured item icon and stack count without a visible item-name label', () => {
    const dirtId = BLOCK_ID['dirt'] ?? 0;
    const world = new WorldMutationStore(
      { x: 0, z: 0 },
      new Uint16Array(CHUNK_VOLUME),
      DEFAULT_ITEM_DEFINITIONS.map((item) => ({
        id: item.id,
        placeable: item.kind === 'block',
        maxStack: item.maxStack,
      })),
      new Map([[dirtId, 32]]),
    );
    const hotbar = new HotbarView(
      world,
      () => undefined,
      (itemId) => `data:image/test,${itemId}`,
    );
    document.body.append(hotbar.element);

    const dirt = hotbar.element.querySelector<HTMLButtonElement>('.hotbar-slot');
    expect(hotbar.element.querySelectorAll('.hotbar-slot')).toHaveLength(9);
    expect(
      [...hotbar.element.querySelectorAll<HTMLButtonElement>('.hotbar-slot')].map((slot) =>
        Number(slot.dataset['itemId']),
      ),
    ).toEqual(DEFAULT_HOTBAR_ITEM_IDS);
    expect(dirt?.querySelector('.item-icon')?.getAttribute('style')).toContain('data:image/test');
    expect(dirt?.querySelector('.stack-count')?.textContent).toBe('32');
    expect(dirt?.textContent).not.toContain('Dirt');
    expect(dirt?.getAttribute('aria-label')).toContain('Dirt');
    hotbar.dispose();
  });

  it('moves an assigned tool between slots without duplicating the assignment', () => {
    const pickaxeId = 1002;
    const world = new WorldMutationStore(
      { x: 0, z: 0 },
      new Uint16Array(CHUNK_VOLUME),
      DEFAULT_ITEM_DEFINITIONS.map((item) => ({
        id: item.id,
        placeable: item.kind === 'block',
        maxStack: item.maxStack,
      })),
      new Map([[pickaxeId, 1]]),
    );
    const hotbar = new HotbarView(world, () => undefined);
    expect(hotbar.assignItem(0, pickaxeId)).toBe(true);
    expect(hotbar.assignItem(1, pickaxeId)).toBe(true);
    expect(hotbar.assignments.filter((id) => id === pickaxeId)).toHaveLength(1);
    expect(hotbar.assignments[0]).toBeNull();
    expect(hotbar.assignments[1]).toBe(pickaxeId);
    hotbar.dispose();
  });

  it('scrolls to adjacent slots with wraparound only while the hotbar is enabled', () => {
    const world = new WorldMutationStore(
      { x: 0, z: 0 },
      new Uint16Array(CHUNK_VOLUME),
      DEFAULT_ITEM_DEFINITIONS.map((item) => ({
        id: item.id,
        placeable: item.kind === 'block',
        maxStack: item.maxStack,
      })),
    );
    const hotbar = new HotbarView(world, () => undefined);

    expect(hotbar.scrollSelection(1)).toBe(false);
    expect(hotbar.selectedSlotIndex).toBe(0);
    hotbar.setEnabled(true);
    expect(hotbar.scrollSelection(1)).toBe(true);
    expect(hotbar.selectedSlotIndex).toBe(1);
    expect(hotbar.scrollSelection(-1)).toBe(true);
    expect(hotbar.selectedSlotIndex).toBe(0);
    expect(hotbar.scrollSelection(-1)).toBe(true);
    expect(hotbar.selectedSlotIndex).toBe(8);
    hotbar.setEnabled(false);
    expect(hotbar.scrollSelection(1)).toBe(false);
    expect(hotbar.selectedSlotIndex).toBe(8);
    hotbar.dispose();
  });
});
