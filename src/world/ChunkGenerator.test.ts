import { describe, expect, it } from 'vitest';
import { BLOCK_ID, DEFAULT_BLOCK_DEFINITIONS } from './defaultBlocks';
import { generateChunk, getBiome, getTerrainHeight } from './ChunkGenerator';

describe('seeded chunk generation', () => {
  it('generates identical terrain for the same seed and coordinate', () => {
    const first = generateChunk({ x: -2, z: 4 }, 'quiet-valley');
    const second = generateChunk({ x: -2, z: 4 }, 'quiet-valley');

    expect(second.blocks).toEqual(first.blocks);
    expect(second.coord).toEqual(first.coord);
  });

  it('changes terrain when the seed changes', () => {
    const first = generateChunk({ x: 0, z: 0 }, 'amber');
    const second = generateChunk({ x: 0, z: 0 }, 'willow');

    expect(second.blocks).not.toEqual(first.blocks);
  });

  it('keeps surface height continuous across chunk edges, including negative coordinates', () => {
    const left = getTerrainHeight('edge-seed', -1, 7);
    const right = getTerrainHeight('edge-seed', 0, 7);

    expect(Math.abs(left - right)).toBeLessThanOrEqual(3);
  });

  it('generates the same tree canopy across adjacent chunk boundaries', () => {
    const seed = 'edge-15';
    const west = generateChunk({ x: 0, z: 0 }, seed);
    const east = generateChunk({ x: 1, z: 0 }, seed);
    const height = getTerrainHeight(seed, 14, 10);

    expect(getBiome(seed, 14, 10)).toBe('forest');
    expect(west.blocks[(height + 1) * 256 + 10 * 16 + 14]).toBe(BLOCK_ID['oak_log']);
    expect(east.blocks[(height + 4) * 256 + 10 * 16]).toBe(BLOCK_ID['oak_leaves']);
  });

  it('generates bounded solid ground with a bedrock floor and registered block IDs', () => {
    const seed = 'starter-world';
    const chunk = generateChunk({ x: 0, z: 0 }, seed);

    for (let z = 0; z < 16; z += 1) {
      for (let x = 0; x < 16; x += 1) {
        expect(chunk.blocks[z * 16 + x]).toBe(BLOCK_ID['bedrock']);
        const height = getTerrainHeight(seed, x, z);
        expect(chunk.blocks[height * 256 + z * 16 + x]).not.toBe(0);
        expect(height).toBeGreaterThan(3);
        expect(height).toBeLessThan(128);
      }
    }

    expect(getTerrainHeight(seed, 0, 0)).toBe(56);
    expect(getBiome(seed, 0, 0)).toBe('ocean');
    expect(chunk.blocks[56 * 256]).toBe(BLOCK_ID['sand']);
    expect(chunk.blocks.some((id) => id === BLOCK_ID['water'])).toBe(true);
    expect([...chunk.blocks].every((id) => id < DEFAULT_BLOCK_DEFINITIONS.length)).toBe(true);
  });
});
