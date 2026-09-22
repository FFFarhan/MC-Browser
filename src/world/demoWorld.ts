import { CHUNK_SIZE, CHUNK_VOLUME } from '../shared/coordinates';
import { BLOCK_ID } from './defaultBlocks';
import type { ChunkMeshSnapshot } from '../meshing/mesh-types';
import { DEFAULT_BLOCK_DEFINITIONS } from './defaultBlocks';

function index(x: number, y: number, z: number): number {
  return y * 256 + z * CHUNK_SIZE + x;
}

export function createDemoWorld(): ChunkMeshSnapshot {
  const blocks = new Uint16Array(CHUNK_VOLUME);
  for (let x = 0; x < CHUNK_SIZE; x += 1)
    for (let z = 0; z < CHUNK_SIZE; z += 1) {
      blocks[index(x, 0, z)] = BLOCK_ID['bedrock'] ?? 0;
      blocks[index(x, 1, z)] = BLOCK_ID['stone'] ?? 0;
      blocks[index(x, 2, z)] = BLOCK_ID['dirt'] ?? 0;
      blocks[index(x, 3, z)] = BLOCK_ID['grass'] ?? 0;
    }
  // A low ridge makes the initial scene read as a small landscape rather than a flat test plane.
  for (let x = 5; x < 11; x += 1)
    for (let z = 4; z < 10; z += 1) {
      const height = 4 + (x > 7 && z > 6 ? 1 : 0);
      for (let y = 4; y <= height; y += 1)
        blocks[index(x, y, z)] = y === height ? (BLOCK_ID['grass'] ?? 0) : (BLOCK_ID['dirt'] ?? 0);
    }
  // A compact original oak silhouette.
  for (let y = 4; y <= 7; y += 1) blocks[index(12, y, 11)] = BLOCK_ID['oak_log'] ?? 0;
  for (let y = 6; y <= 9; y += 1)
    for (let x = 10; x <= 14; x += 1)
      for (let z = 9; z <= 13; z += 1) {
        if (
          Math.abs(x - 12) + Math.abs(z - 11) + Math.max(0, y - 7) <= 5 &&
          blocks[index(x, y, z)] === 0
        ) {
          blocks[index(x, y, z)] = BLOCK_ID['oak_leaves'] ?? 0;
        }
      }
  blocks[index(3, 4, 5)] = BLOCK_ID['tall_grass'] ?? 0;
  blocks[index(4, 4, 5)] = BLOCK_ID['tall_grass'] ?? 0;
  return {
    coord: { x: 0, z: 0 },
    blocks,
    revision: 1,
    definitions: DEFAULT_BLOCK_DEFINITIONS,
    neighbors: {},
  };
}
