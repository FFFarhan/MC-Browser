import { describe, expect, it } from 'vitest';
import { OriginManager } from './OriginManager';

describe('OriginManager', () => {
  it('rebases render positions while preserving integer world coordinates', () => {
    const origin = new OriginManager(8);
    const block = { chunkX: 10_000, chunkZ: -7_000, localX: 2, localZ: 15, y: 71 };

    expect(origin.rebaseIfNeeded({ x: 10_000, z: -7_000 })).toBe(true);
    const after = origin.toRenderPosition(block);

    expect(after).toEqual({ x: 2, y: 71, z: 15 });
    expect(origin.getOrigin()).toEqual({ x: 10_000, z: -7_000 });
    expect(block).toEqual({ chunkX: 10_000, chunkZ: -7_000, localX: 2, localZ: 15, y: 71 });
  });

  it('does not repeatedly rebase inside its local range', () => {
    const origin = new OriginManager(8);

    expect(origin.rebaseIfNeeded({ x: 7, z: -7 })).toBe(false);
    expect(origin.rebaseIfNeeded({ x: 8, z: 0 })).toBe(false);
    expect(origin.rebaseIfNeeded({ x: 9, z: 0 })).toBe(true);
  });

  it('preserves fractional player coordinates across a rebase', () => {
    const origin = new OriginManager(4);
    const player = { chunkX: 20, chunkZ: -11, localX: 0.25, localZ: 15.75, y: 7.5 };
    const before = origin.toRenderPosition(player);
    expect(origin.rebaseIfNeeded({ x: player.chunkX, z: player.chunkZ })).toBe(true);
    const after = origin.toRenderPosition(player);
    expect(before.x).toBeCloseTo(player.chunkX * 16 + player.localX);
    expect(before.z).toBeCloseTo(player.chunkZ * 16 + player.localZ);
    expect(after).toEqual({ x: player.localX, y: player.y, z: player.localZ });
  });
});
