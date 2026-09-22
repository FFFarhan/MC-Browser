import { describe, expect, it } from 'vitest';
import { CHUNK_VOLUME } from '../shared/coordinates';
import { BlockInteraction } from './BlockInteraction';
import { createPlayerState } from '../player/PlayerState';
import { DEFAULT_BLOCKS, DEFAULT_BLOCK_DEFINITIONS, BLOCK_ID } from '../world/defaultBlocks';
import { WorldMutationStore } from '../world/MutationBatch';

function fixture(playerX = 2.5) {
  const blocks = new Uint16Array(CHUNK_VOLUME);
  blocks[1 * 256 + 4 * 16 + 4] = BLOCK_ID['stone'] ?? 0;
  const world = new WorldMutationStore(
    { x: 0, z: 0 },
    blocks,
    DEFAULT_BLOCK_DEFINITIONS.map((block) => ({ id: block.id, placeable: block.id !== 0 })),
    new Map([[BLOCK_ID['dirt'] ?? 0, 2]]),
  );
  const player = createPlayerState(
    { chunkX: 0, localX: playerX, y: 0.2, chunkZ: 0, localZ: 4.5 },
    -Math.PI / 2,
  );
  return { world, interaction: new BlockInteraction(world, DEFAULT_BLOCKS, () => player) };
}

describe('block interaction', () => {
  it('breaks the targeted block and awards its drop in the same mutation', () => {
    const { world, interaction } = fixture();
    expect(interaction.interact('break', BLOCK_ID['dirt'] ?? 0).changed).toBe(true);
    expect(world.getBlock(4, 1, 4)).toBe(0);
    expect(world.getItemCount(BLOCK_ID['stone'] ?? 0)).toBe(1);
    expect(world.revision).toBe(1);
  });
  it('places a selected block atomically, but never inside the player or without inventory', () => {
    const { world, interaction } = fixture();
    expect(interaction.interact('place', BLOCK_ID['dirt'] ?? 0).changed).toBe(true);
    expect(world.getBlock(3, 1, 4)).toBe(BLOCK_ID['dirt']);
    expect(world.getItemCount(BLOCK_ID['dirt'] ?? 0)).toBe(1);
    const overlap = fixture(2.8);
    expect(overlap.interaction.interact('place', BLOCK_ID['dirt'] ?? 0).changed).toBe(false);
    expect(overlap.world.getBlock(3, 1, 4)).toBe(0);
    const noInventory = new WorldMutationStore(
      { x: 0, z: 0 },
      new Uint16Array(CHUNK_VOLUME),
      DEFAULT_BLOCK_DEFINITIONS.map((block) => ({ id: block.id, placeable: block.id !== 0 })),
    );
    const player = createPlayerState(
      { chunkX: 0, localX: 2.5, y: 0.2, chunkZ: 0, localZ: 4.5 },
      -Math.PI / 2,
    );
    expect(
      new BlockInteraction(noInventory, DEFAULT_BLOCKS, () => player).interact(
        'place',
        BLOCK_ID['dirt'] ?? 0,
      ).changed,
    ).toBe(false);
  });
});
