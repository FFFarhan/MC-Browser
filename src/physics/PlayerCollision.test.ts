import { describe, expect, it } from 'vitest';
import { findSafeSpawn, sweepAabb, type CollisionWorld } from './PlayerCollision';
import { DEFAULT_PLAYER_COLLIDER } from '../player/PlayerState';

function worldWithFloorAndWall(): CollisionWorld {
  return {
    collisionAt(x, y, z) {
      if (y < 0) return 'solid';
      if (y === 0) return 'solid';
      if (x === 4 && y < 6 && z >= -2 && z <= 2) return 'solid';
      return 'empty';
    },
  };
}

describe('swept player collision', () => {
  it('stops at solid walls without penetrating and slides on the other axes', () => {
    const result = sweepAabb(
      { chunkX: 0, localX: 3, y: 1, chunkZ: 0, localZ: 0 },
      { x: 2, y: 0, z: 1 },
      DEFAULT_PLAYER_COLLIDER,
      worldWithFloorAndWall(),
    );
    expect(result.position.localX).toBeLessThan(3.701);
    expect(result.position.localX).toBeGreaterThan(3.69);
    expect(result.position.localZ).toBeCloseTo(1, 2);
    expect(result.velocity.x).toBe(0);
  });

  it('treats unloaded terrain as a solid streaming barrier', () => {
    const world: CollisionWorld = {
      collisionAt: (x) => (x >= 4 ? 'unloaded' : 'empty'),
    };
    const result = sweepAabb(
      { chunkX: 0, localX: 3, y: 2, chunkZ: 0, localZ: 0 },
      { x: 3, y: 0, z: 0 },
      DEFAULT_PLAYER_COLLIDER,
      world,
    );
    expect(result.position.localX).toBeLessThan(3.701);
  });

  it('finds a safe standing position above the highest walkable ground', () => {
    const spawn = findSafeSpawn(2, 3, 12, DEFAULT_PLAYER_COLLIDER, worldWithFloorAndWall());
    expect(spawn).toEqual({ chunkX: 0, localX: 2.5, y: 1, chunkZ: 0, localZ: 3.5 });
  });
});
