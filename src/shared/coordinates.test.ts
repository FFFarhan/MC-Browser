import { describe, expect, it } from 'vitest';
import { worldBlockIndex, worldToChunk } from './coordinates';
import { chunkKey } from './chunk-key';

describe('world coordinates', () => {
  it.each([
    [-17, -2, 15],
    [-16, -1, 0],
    [-1, -1, 15],
    [0, 0, 0],
    [15, 0, 15],
    [16, 1, 0],
    [17, 1, 1],
  ])('maps world coordinate %i to chunk %i and local %i', (x, chunkX, localX) => {
    expect(worldToChunk(x, 0)).toEqual({
      chunk: { x: chunkX, z: 0 },
      localX,
      localZ: 0,
    });
  });

  it('maps negative coordinates on both horizontal axes independently', () => {
    expect(worldToChunk(-17, -1)).toEqual({
      chunk: { x: -2, z: -1 },
      localX: 15,
      localZ: 15,
    });
  });

  it('indexes block storage with x as the contiguous axis', () => {
    expect(worldBlockIndex(0, 0, 0)).toBe(0);
    expect(worldBlockIndex(15, 0, 0)).toBe(15);
    expect(worldBlockIndex(0, 0, 1)).toBe(16);
    expect(worldBlockIndex(0, 1, 0)).toBe(256);
    expect(worldBlockIndex(15, 191, 15)).toBe(49_151);
  });

  it('rejects non-integer and unsafe world coordinates', () => {
    expect(() => worldToChunk(1.5, 0)).toThrow(RangeError);
    expect(() => worldToChunk(Number.MAX_SAFE_INTEGER + 1, 0)).toThrow(RangeError);
  });

  it('builds collision-free chunk keys for negative and positive pairs', () => {
    const keys = new Set([
      chunkKey({ x: -1, z: 23 }),
      chunkKey({ x: 1, z: -23 }),
      chunkKey({ x: -12, z: 3 }),
      chunkKey({ x: -1, z: 23 }),
    ]);

    expect(keys.size).toBe(3);
    expect(() => chunkKey({ x: 1.2, z: 0 })).toThrow(RangeError);
  });
});
