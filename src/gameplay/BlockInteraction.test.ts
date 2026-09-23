import { describe, expect, it } from 'vitest';
import { CHUNK_VOLUME } from '../shared/coordinates';
import { BlockInteraction } from './BlockInteraction';
import { createPlayerState } from '../player/PlayerState';
import { DEFAULT_BLOCKS, DEFAULT_BLOCK_DEFINITIONS, BLOCK_ID } from '../world/defaultBlocks';
import { WorldMutationStore } from '../world/MutationBatch';
import { DEFAULT_ITEM_DEFINITIONS, ITEM_ID } from '../world/ItemRegistry';

function fixture(playerX = 2.5, targetBlockId = BLOCK_ID['stone'] ?? 0) {
  const blocks = new Uint16Array(CHUNK_VOLUME);
  blocks[1 * 256 + 4 * 16 + 4] = targetBlockId;
  const world = new WorldMutationStore(
    { x: 0, z: 0 },
    blocks,
    DEFAULT_ITEM_DEFINITIONS.map((item) => ({
      id: item.id,
      placeable: item.kind === 'block',
      maxStack: item.maxStack,
    })),
    new Map([
      [BLOCK_ID['dirt'] ?? 0, 2],
      [ITEM_ID['wooden_pickaxe'] ?? 0, 1],
    ]),
  );
  const player = createPlayerState(
    { chunkX: 0, localX: playerX, y: 0.2, chunkZ: 0, localZ: 4.5 },
    -Math.PI / 2,
  );
  return { world, interaction: new BlockInteraction(world, DEFAULT_BLOCKS, () => player) };
}

describe('block interaction', () => {
  it('returns a break target without changing it before its mining timer completes', () => {
    const { world, interaction } = fixture();
    const target = interaction.getMiningTarget();

    expect(target).toMatchObject({
      key: '4,1,4:stonefield:stone:hand',
      blockId: BLOCK_ID['stone'],
      position: { x: 4, y: 1, z: 4 },
    });
    expect(target?.hardnessSeconds).toBe(
      DEFAULT_BLOCKS.get(BLOCK_ID['stone'] ?? 0).hardnessSeconds,
    );
    expect(world.getBlock(4, 1, 4)).toBe(BLOCK_ID['stone']);
  });

  it('breaks only the still-matching target once the caller completes the timer', () => {
    const { world, interaction } = fixture();
    const target = interaction.getMiningTarget(ITEM_ID['wooden_pickaxe'] ?? 0);
    expect(target).not.toBeNull();
    if (!target) throw new Error('Expected the stone block to be targeted');

    expect(interaction.breakTarget(target).changed).toBe(true);
    expect(world.getBlock(4, 1, 4)).toBe(0);
    expect(world.getItemCount(BLOCK_ID['stone'] ?? 0)).toBe(1);
    expect(world.revision).toBe(1);
  });

  it('allows under-tier mining but does not give a block drop without a sufficient tool', () => {
    const { world, interaction } = fixture();
    const target = interaction.getMiningTarget();
    if (!target) throw new Error('Expected the stone block to be targeted');
    expect(interaction.breakTarget(target).changed).toBe(true);
    expect(world.getBlock(4, 1, 4)).toBe(0);
    expect(world.getItemCount(BLOCK_ID['stone'] ?? 0)).toBe(0);
  });

  it('reports different mining time with a matching tool and keeps its held item identity', () => {
    const { interaction } = fixture();
    const hand = interaction.getMiningTarget();
    const pickaxe = interaction.getMiningTarget(ITEM_ID['wooden_pickaxe'] ?? 0);
    expect(hand?.hardnessSeconds).toBeGreaterThan(pickaxe?.hardnessSeconds ?? 0);
    expect(pickaxe?.heldItemId).toBe(ITEM_ID['wooden_pickaxe']);
    expect(pickaxe?.dropAllowed).toBe(true);
  });

  it('lets Creative break otherwise unbreakable blocks instantly without drops', () => {
    const { world, interaction } = fixture(2.5, BLOCK_ID['bedrock'] ?? 0);
    expect(interaction.getMiningTarget()).toBeNull();

    const target = interaction.getMiningTarget(null, true);
    expect(target).toMatchObject({ hardnessSeconds: 0, dropAllowed: false });
    if (!target) throw new Error('Expected Creative to target bedrock');

    expect(interaction.breakTarget(target, true).changed).toBe(true);
    expect(world.getBlock(4, 1, 4)).toBe(0);
    expect(world.getItemCount(BLOCK_ID['bedrock'] ?? 0)).toBe(0);
  });

  it('allows Creative placement with no inventory and does not consume items', () => {
    const blocks = new Uint16Array(CHUNK_VOLUME);
    blocks[1 * 256 + 4 * 16 + 4] = BLOCK_ID['stone'] ?? 0;
    const world = new WorldMutationStore(
      { x: 0, z: 0 },
      blocks,
      DEFAULT_ITEM_DEFINITIONS.map((item) => ({
        id: item.id,
        placeable: item.kind === 'block',
        maxStack: item.maxStack,
      })),
    );
    const player = createPlayerState(
      { chunkX: 0, localX: 2.5, y: 0.2, chunkZ: 0, localZ: 4.5 },
      -Math.PI / 2,
    );
    const interaction = new BlockInteraction(world, DEFAULT_BLOCKS, () => player);

    expect(interaction.interact(BLOCK_ID['dirt'] ?? 0, true).changed).toBe(true);
    expect(world.getBlock(3, 1, 4)).toBe(BLOCK_ID['dirt']);
    expect(world.getItemCount(BLOCK_ID['dirt'] ?? 0)).toBe(0);
  });

  it('places a selected block atomically, but never inside the player or without inventory', () => {
    const { world, interaction } = fixture();
    expect(interaction.interact(BLOCK_ID['dirt'] ?? 0).changed).toBe(true);
    expect(world.getBlock(3, 1, 4)).toBe(BLOCK_ID['dirt']);
    expect(world.getItemCount(BLOCK_ID['dirt'] ?? 0)).toBe(1);
    const overlap = fixture(2.8);
    expect(overlap.interaction.interact(BLOCK_ID['dirt'] ?? 0).changed).toBe(false);
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
        BLOCK_ID['dirt'] ?? 0,
      ).changed,
    ).toBe(false);
  });

  it('exposes a non-mutating placement preview for remote authority checks', () => {
    const { world, interaction } = fixture();
    expect(interaction.getPlacementTarget(BLOCK_ID['dirt'] ?? 0)).toEqual({ x: 3, y: 1, z: 4 });
    expect(interaction.getPlacementTarget(0)).toBeNull();
    expect(world.getBlock(3, 1, 4)).toBe(0);
    expect(world.getItemCount(BLOCK_ID['dirt'] ?? 0)).toBe(2);
  });
});
