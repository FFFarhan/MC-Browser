import { describe, expect, it } from 'vitest';
import type { ChunkMeshSnapshot } from '../meshing/mesh-types';
import { CHUNK_VOLUME, worldBlockIndex } from '../shared/coordinates';
import { chunkKey } from '../shared/chunk-key';
import { DEFAULT_BLOCK_DEFINITIONS, BLOCK_ID } from '../world/defaultBlocks';
import { createChunkCollisionWorld } from './ChunkCollisionWorld';

function snapshot(x: number, blocks = new Uint16Array(CHUNK_VOLUME)): ChunkMeshSnapshot {
  return {
    coord: { x, z: 0 },
    blocks,
    revision: 0,
    definitions: DEFAULT_BLOCK_DEFINITIONS,
    neighbors: {},
  };
}

describe('loaded chunk collision lookup', () => {
  it('uses floor-based chunk addressing across negative and positive boundaries', () => {
    const westBlocks = new Uint16Array(CHUNK_VOLUME);
    westBlocks[worldBlockIndex(15, 1, 0)] = BLOCK_ID['stone']!;
    const eastBlocks = new Uint16Array(CHUNK_VOLUME);
    eastBlocks[worldBlockIndex(0, 1, 0)] = BLOCK_ID['oak_leaves']!;
    const chunks = new Map([
      [chunkKey({ x: -1, z: 0 }), snapshot(-1, westBlocks)],
      [chunkKey({ x: 0, z: 0 }), snapshot(0, eastBlocks)],
    ]);
    const world = createChunkCollisionWorld(chunks);

    expect(world.collisionAt(-1, 1, 0)).toBe('solid');
    expect(world.collisionAt(0, 1, 0)).toBe('empty');
  });

  it('treats unloaded chunks as barriers and respects vertical world bounds', () => {
    const world = createChunkCollisionWorld(new Map([[chunkKey({ x: 0, z: 0 }), snapshot(0)]]));

    expect(world.collisionAt(16, 1, 0)).toBe('unloaded');
    expect(world.collisionAt(0, -1, 0)).toBe('solid');
    expect(world.collisionAt(0, 192, 0)).toBe('empty');
  });
});
