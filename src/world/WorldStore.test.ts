import { describe, expect, it } from 'vitest';
import { ChunkData } from './ChunkData';
import { WorldStore } from './WorldStore';

describe('WorldStore', () => {
  it('distinguishes loaded blocks, unloaded chunks, above-world air, and lower boundary', () => {
    const world = new WorldStore(0, 1);
    const chunk = new ChunkData({ x: -1, z: 0 });
    chunk.set(15, 63, 0, 4);
    world.setGeneratedChunk(chunk);

    expect(world.getBlock(-1, 63, 0)).toEqual({ kind: 'block', id: 4 });
    expect(world.getBlock(0, 63, 0)).toEqual({ kind: 'unloaded', chunk: { x: 0, z: 0 } });
    expect(world.getBlock(-1, 192, 0)).toEqual({ kind: 'above' });
    expect(world.getBlock(-1, -1, 0)).toEqual({ kind: 'boundary', id: 1 });
  });

  it('returns the loaded chunk without exposing unloaded chunks as air', () => {
    const world = new WorldStore(0, 1);
    const chunk = new ChunkData({ x: 2, z: -3 });
    world.setGeneratedChunk(chunk);

    expect(world.getLoadedChunk({ x: 2, z: -3 })).toBe(chunk);
    expect(world.getLoadedChunk({ x: 2, z: -2 })).toBeUndefined();
  });

  it('refuses to replace a loaded chunk with a late generated result', () => {
    const world = new WorldStore(0, 1);
    const current = new ChunkData({ x: 1, z: 1 });
    current.set(0, 40, 0, 9);
    world.setGeneratedChunk(current);

    expect(() => world.setGeneratedChunk(new ChunkData({ x: 1, z: 1 }))).toThrow(/already loaded/);
    expect(world.getBlock(16, 40, 16)).toEqual({ kind: 'block', id: 9 });
  });
});
