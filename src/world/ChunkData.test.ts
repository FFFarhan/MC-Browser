import { describe, expect, it } from 'vitest';
import { CHUNK_BLOCK_COUNT, CHUNK_VOLUME, worldBlockIndex } from '../shared/coordinates';
import { ChunkData } from './ChunkData';

describe('ChunkData', () => {
  it('stores blocks in a compact chunk buffer and increments revisions on changes', () => {
    const chunk = new ChunkData({ x: -2, z: 5 });

    expect(chunk.blocks.length).toBe(CHUNK_VOLUME);
    expect(chunk.get(15, 191, 15)).toBe(0);
    chunk.set(15, 191, 15, 7);
    expect(chunk.get(15, 191, 15)).toBe(7);
    expect(chunk.revision).toBe(1);
    chunk.set(15, 191, 15, 7);
    expect(chunk.revision).toBe(1);
    expect(CHUNK_BLOCK_COUNT).toBe(CHUNK_VOLUME);
  });

  it('round trips a copy of the chunk data and revision', () => {
    const chunk = new ChunkData({ x: -1, z: -1 });
    chunk.set(0, 63, 15, 12);

    const restored = ChunkData.deserialize(chunk.serialize());

    expect(restored.coord).toEqual({ x: -1, z: -1 });
    expect(restored.get(0, 63, 15)).toBe(12);
    expect(restored.revision).toBe(chunk.revision);
    expect(restored.blocks).not.toBe(chunk.blocks);
    const copiedBlocks = restored.blocks;
    copiedBlocks[worldBlockIndex(0, 63, 15)] = 1;
    expect(restored.get(0, 63, 15)).toBe(12);
  });

  it('rejects invalid local positions and block IDs', () => {
    const chunk = new ChunkData({ x: 0, z: 0 });

    expect(() => chunk.get(-1, 0, 0)).toThrow(RangeError);
    expect(() => chunk.set(0, 192, 0, 1)).toThrow(RangeError);
    expect(() => chunk.set(0, 0, 0, -1)).toThrow(RangeError);
    expect(() => chunk.set(0, 0, 0, 65_536)).toThrow(RangeError);
  });

  it('does not mutate block data when its revision counter cannot advance safely', () => {
    const chunk = new ChunkData({ x: 0, z: 0 }, undefined, Number.MAX_SAFE_INTEGER);

    expect(() => chunk.set(0, 0, 0, 3)).toThrow(RangeError);
    expect(chunk.get(0, 0, 0)).toBe(0);
    expect(chunk.revision).toBe(Number.MAX_SAFE_INTEGER);
  });
});
