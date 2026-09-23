import { describe, expect, it } from 'vitest';
import type { CollisionWorld } from '../physics/PlayerCollision';
import { createChunkCollisionWorld } from '../physics/ChunkCollisionWorld';
import { WORLD_HEIGHT } from '../shared/coordinates';
import { chunkKey } from '../shared/chunk-key';
import { generateChunk } from '../world/ChunkGenerator';
import { createEquipmentState } from './Equipment';
import { canSpawnMob, MobSystem, type MobSpawnCandidate } from './MobSystem';

function floorWorld(roofY: number | null = null): CollisionWorld {
  return {
    collisionAt: (_x, y) => {
      if (y < 0 || y === 1 || (roofY !== null && y === roofY)) return 'solid';
      return y >= WORLD_HEIGHT ? 'empty' : 'empty';
    },
  };
}

const candidate: MobSpawnCandidate = {
  x: 8,
  z: 8,
  floorY: 1,
  playerFloorY: 1,
  distance: 8,
};

describe('bounded nighttime and cave mob simulation', () => {
  it('allows surface spawns only at night and cave spawns with a solid roof', () => {
    const surface = floorWorld();
    const cave = floorWorld(12);
    expect(canSpawnMob(candidate, 500, surface)).toBe(false);
    expect(canSpawnMob(candidate, 10, surface)).toBe(true);
    expect(canSpawnMob(candidate, 500, cave)).toBe(true);
    expect(canSpawnMob(candidate, 500, floorWorld())).toBe(false);
  });

  it('spawns within a nearby reachable range in an actual generated cave during daytime', () => {
    const seed = 'quiet-valley';
    const chunks = new Map<string, ReturnType<typeof generateChunk>>();
    for (let z = -1; z <= 1; z += 1)
      for (let x = -1; x <= 1; x += 1) {
        const coord = { x, z };
        chunks.set(chunkKey(coord), generateChunk(coord, seed));
      }
    const world = createChunkCollisionWorld(chunks);
    const player = { x: 13.5, y: 10, z: 7.5 };
    const system = new MobSystem(seed);

    for (let step = 0; step < 24 && system.getMobs().length === 0; step += 1)
      system.tick(0.5, 500, player, world);

    const mob = system.getMobs()[0];
    expect(mob).toBeDefined();
    expect(Math.hypot((mob?.x ?? 0) - player.x, (mob?.z ?? 0) - player.z)).toBeLessThanOrEqual(12);
  });

  it('does not put a daytime cave creature in a separate chamber behind solid rock', () => {
    const world: CollisionWorld = {
      collisionAt: (x, y) => {
        if (y < 0 || y === 1 || y === 12 || (x === 10 && y > 1 && y < 12)) return 'solid';
        return 'empty';
      },
    };
    const player = { x: 8.5, y: 2, z: 8.5 };
    const system = new MobSystem('mob-limit-seed');

    for (let step = 0; step < 200 && system.getMobs().length === 0; step += 1)
      system.tick(0.5, 500, player, world);

    const mobs = system.getMobs();
    expect(mobs.length).toBeGreaterThan(0);
    expect(mobs.every((mob) => mob.x < 10)).toBe(true);
  });

  it('rejects blocked floor, obstructed headroom, unloaded cells, and unsafe distances', () => {
    const blockedHeadroom: CollisionWorld = {
      collisionAt: (_x, y) => (y === 1 || y === 2 ? 'solid' : 'empty'),
    };
    const unloaded: CollisionWorld = {
      collisionAt: (_x, y) => (y === 1 ? 'solid' : y > 5 ? 'unloaded' : 'empty'),
    };
    expect(canSpawnMob({ ...candidate, distance: 4 }, 10, floorWorld())).toBe(false);
    expect(canSpawnMob({ ...candidate, floorY: 0 }, 10, floorWorld())).toBe(false);
    expect(canSpawnMob(candidate, 10, blockedHeadroom)).toBe(false);
    expect(canSpawnMob(candidate, 10, unloaded)).toBe(false);
  });

  it('does not place a surface creature several blocks below the player', () => {
    expect(canSpawnMob({ ...candidate, playerFloorY: 4 }, 10, floorWorld())).toBe(true);
    expect(canSpawnMob({ ...candidate, playerFloorY: 5 }, 10, floorWorld())).toBe(false);
  });

  it('keeps total and per-chunk populations bounded and does not spawn while paused', () => {
    const system = new MobSystem('mob-limit-seed');
    const player = { x: 8, y: 2, z: 8 };
    const world = floorWorld();
    for (let step = 0; step < 180; step += 1) system.tick(0.5, 10, player, world, false);
    expect(system.getMobs().length).toBeLessThanOrEqual(12);
    const perChunk = new Map<string, number>();
    for (const mob of system.getMobs()) {
      const key = `${Math.floor(mob.x / 16)},${Math.floor(mob.z / 16)}`;
      perChunk.set(key, (perChunk.get(key) ?? 0) + 1);
    }
    expect([...perChunk.values()].every((count) => count <= 3)).toBe(true);

    const paused = new MobSystem('pause-seed');
    for (let step = 0; step < 120; step += 1) paused.tick(0.5, 10, player, world, true);
    expect(paused.getMobs()).toHaveLength(0);
  });

  it('lets a nearby weapon damage and defeat a mob with cooldown and durability', () => {
    const system = new MobSystem('combat-seed');
    const player = { x: 8, y: 2, z: 8 };
    for (let step = 0; step < 16 && system.getMobs().length === 0; step += 1)
      system.tick(0.5, 10, player, floorWorld(), false);
    const target = system.getMobs()[0];
    if (!target) throw new Error('Expected a mob to spawn in the test world');
    const adjacentPlayer = { x: target.x, y: target.y, z: target.z };
    let equipment = createEquipmentState();
    let now = 1_000;
    let result = system.attackNearest(adjacentPlayer, 1013, now, equipment);
    expect(result.accepted).toBe(true);
    equipment = result.equipment;
    const onCooldown = system.attackNearest(adjacentPlayer, 1013, now + 200, equipment);
    expect(onCooldown.accepted).toBe(false);
    for (let hit = 0; hit < 4 && system.getMobs().length > 0; hit += 1) {
      now += 600;
      result = system.attackNearest(adjacentPlayer, 1013, now, equipment);
      equipment = result.equipment;
    }
    expect(system.getMobs()).toHaveLength(0);
    expect(result.defeated).toBe(true);
    expect(result.dropItemId).toBeGreaterThan(0);
    expect(equipment.durability.get(1013)).toBe(98);
  });

  it('lets the player defeat a nearby mob with unarmed attacks', () => {
    const system = new MobSystem('unarmed-combat-seed');
    const spawnPlayer = { x: 8, y: 2, z: 8 };
    for (let step = 0; step < 16 && system.getMobs().length === 0; step += 1)
      system.tick(0.5, 10, spawnPlayer, floorWorld(), false);
    const target = system.getMobs()[0];
    if (!target) throw new Error('Expected a mob to spawn in the test world');

    const adjacentPlayer = { x: target.x, y: target.y, z: target.z };
    let equipment = createEquipmentState();
    let now = 1_000;
    let result = system.attackNearest(adjacentPlayer, null, now, equipment);
    expect(result).toMatchObject({ accepted: true, damage: 1 });
    equipment = result.equipment;
    for (let hit = 1; hit < target.health; hit += 1) {
      now += 600;
      result = system.attackNearest(adjacentPlayer, null, now, equipment);
      expect(result.accepted).toBe(true);
      equipment = result.equipment;
    }

    expect(system.getMobs()).toHaveLength(0);
    expect(result.defeated).toBe(true);
  });

  it('damages a player when a creature reaches melee distance', () => {
    const system = new MobSystem('mob-damage-seed');
    const spawnPlayer = { x: 8, y: 2, z: 8 };
    for (let step = 0; step < 16 && system.getMobs().length === 0; step += 1)
      system.tick(0.5, 10, spawnPlayer, floorWorld(), false);
    const mob = system.getMobs()[0];
    if (!mob) throw new Error('Expected a mob to spawn in the test world');

    const result = system.tick(0.05, 500, { x: mob.x, y: mob.y, z: mob.z }, floorWorld(), false);

    expect(result.playerDamage).toBeGreaterThan(0);
  });
});
