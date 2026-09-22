import { describe, expect, it } from 'vitest';
import { CHUNK_VOLUME } from '../shared/coordinates';
import { WorldMutationStore, commitMutation, MutationBatch } from './MutationBatch';

function storeWithStone() {
  const blocks = new Uint16Array(CHUNK_VOLUME);
  blocks[2 * 256 + 3 * 16 + 4] = 1;
  return new WorldMutationStore(
    { x: 0, z: 0 },
    blocks,
    [
      { id: 0, placeable: false },
      { id: 1, placeable: true },
    ],
    new Map([[1, 2]]),
  );
}

describe('atomic voxel mutation batches', () => {
  it('applies a block change and its item delta as one revision', () => {
    const store = storeWithStone();
    const batch = new MutationBatch(store.revision)
      .changeBlock({ x: 4, y: 2, z: 3 }, 1, 0)
      .changeItem(1, 1);
    expect(commitMutation(store, batch)).toBe(true);
    expect(store.getBlock(4, 2, 3)).toBe(0);
    expect(store.getItemCount(1)).toBe(3);
    expect(store.revision).toBe(1);
  });
  it('leaves world and inventory unchanged when inventory or revision validation fails', () => {
    const store = storeWithStone();
    const noItems = new WorldMutationStore({ x: 0, z: 0 }, new Uint16Array(CHUNK_VOLUME), [
      { id: 0, placeable: false },
      { id: 1, placeable: true },
    ]);
    const place = new MutationBatch(noItems.revision)
      .changeBlock({ x: 4, y: 2, z: 3 }, 0, 1)
      .changeItem(1, -1);
    expect(commitMutation(noItems, place)).toBe(false);
    expect(noItems.getBlock(4, 2, 3)).toBe(0);
    expect(noItems.getItemCount(1)).toBe(0);
    const stale = new MutationBatch(9).changeBlock({ x: 4, y: 2, z: 3 }, 1, 0).changeItem(1, 1);
    expect(commitMutation(store, stale)).toBe(false);
    expect(store.getBlock(4, 2, 3)).toBe(1);
    expect(store.getItemCount(1)).toBe(2);
  });
});
