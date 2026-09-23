import type { CollisionWorld } from '../physics/PlayerCollision';
import { WORLD_HEIGHT } from '../shared/coordinates';
import { dayPhase } from '../world/WorldClock';
import { attackWithMelee, type EquipmentState } from './Equipment';
import { MOB_DEFINITION_BY_TYPE } from './MobRegistry';

const MAX_MOBS = 12;
const MAX_MOBS_PER_CHUNK = 3;
const SPAWN_INTERVAL_SECONDS = 3.5;
const MIN_SPAWN_DISTANCE = 6;
const MAX_SPAWN_DISTANCE = 20;
const MIN_CAVE_SPAWN_DISTANCE = 4;
const MAX_CAVE_SPAWN_DISTANCE = 12;
const SPAWN_ATTEMPTS_PER_TICK = 12;
const MAX_SPAWN_ELEVATION_DIFFERENCE = 3;
const ATTACK_REACH = 4.5;
const ATTACK_INTERVAL_SECONDS = 1.25;

export type MobType = 'mossling' | 'cinder';

export interface MobRecord {
  readonly id: number;
  readonly type: MobType;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly attackCooldown: number;
}

export interface MobSpawnCandidate {
  readonly x: number;
  readonly z: number;
  readonly floorY: number;
  readonly playerFloorY: number;
  readonly distance: number;
}

export interface MobTickResult {
  readonly playerDamage: number;
  readonly spawned: number;
}

export interface MobWorldPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface MobAttackResult {
  readonly accepted: boolean;
  readonly equipment: EquipmentState;
  readonly mobId: number | null;
  readonly damage: number;
  readonly defeated: boolean;
  readonly dropItemId: number | null;
  readonly weaponBroken: boolean;
}

type CaveColumnStatus = 'cave' | 'open' | 'unloaded';

export function canSpawnMob(
  candidate: MobSpawnCandidate,
  worldTime: number,
  world: CollisionWorld,
): boolean {
  if (
    !Number.isSafeInteger(candidate.x) ||
    !Number.isSafeInteger(candidate.z) ||
    !Number.isSafeInteger(candidate.floorY) ||
    !Number.isSafeInteger(candidate.playerFloorY) ||
    candidate.floorY < 0 ||
    candidate.floorY >= WORLD_HEIGHT - 3 ||
    candidate.playerFloorY < 0 ||
    candidate.playerFloorY >= WORLD_HEIGHT - 3 ||
    Math.abs(candidate.floorY - candidate.playerFloorY) > MAX_SPAWN_ELEVATION_DIFFERENCE ||
    !Number.isFinite(candidate.distance) ||
    candidate.distance < MIN_SPAWN_DISTANCE ||
    candidate.distance > MAX_SPAWN_DISTANCE ||
    world.collisionAt(candidate.x, candidate.floorY, candidate.z) !== 'solid'
  )
    return false;
  const feetY = candidate.floorY + 1;
  if (
    world.collisionAt(candidate.x, feetY, candidate.z) !== 'empty' ||
    world.collisionAt(candidate.x, feetY + 1, candidate.z) !== 'empty'
  )
    return false;

  const columnStatus = caveColumnStatus(candidate.x, candidate.z, candidate.floorY, world);
  if (columnStatus === 'unloaded') return false;
  if (columnStatus === 'cave') return true;
  return dayPhase(worldTime) === 'night';
}

export class MobSystem {
  private readonly mobs: MobRecord[] = [];
  private randomState: number;
  private elapsedSinceSpawn = 0;
  private nextId = 1;

  constructor(seed: number | string) {
    this.randomState = hashSeed(seed) || 1;
  }

  getMobs(): readonly MobRecord[] {
    return this.mobs.map((mob) => ({ ...mob }));
  }

  tick(
    deltaSeconds: number,
    worldTime: number,
    player: MobWorldPosition,
    world: CollisionWorld,
    paused = false,
  ): MobTickResult {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0 || deltaSeconds > 1)
      throw new RangeError('Mob simulation step must be in [0,1] seconds');
    for (const value of [player.x, player.y, player.z])
      if (!Number.isFinite(value))
        throw new RangeError('Mob simulation player position is invalid');
    dayPhase(worldTime);
    if (paused) return { playerDamage: 0, spawned: 0 };

    let playerDamage = 0;
    for (let index = this.mobs.length - 1; index >= 0; index -= 1) {
      const mob = this.mobs[index];
      if (!mob) continue;
      const definition = MOB_DEFINITION_BY_TYPE.get(mob.type);
      if (!definition) continue;
      const dx = player.x - mob.x;
      const dz = player.z - mob.z;
      const distance = Math.hypot(dx, dz);
      let cooldown = Math.max(0, mob.attackCooldown - deltaSeconds);
      let next = { ...mob, attackCooldown: cooldown };
      if (distance <= 1.5) {
        if (cooldown <= 0) {
          playerDamage += definition.attackDamage;
          cooldown = ATTACK_INTERVAL_SECONDS;
          next = { ...next, attackCooldown: cooldown };
        }
      } else if (distance > 0.001) {
        const travel = Math.min(definition.moveSpeed * deltaSeconds, distance - 1.25);
        const x = mob.x + (dx / distance) * travel;
        const z = mob.z + (dz / distance) * travel;
        if (
          ((Math.floor(x / 16) === Math.floor(mob.x / 16) &&
            Math.floor(z / 16) === Math.floor(mob.z / 16)) ||
            countMobsInChunk(this.mobs, x, z) < MAX_MOBS_PER_CHUNK) &&
          world.collisionAt(Math.floor(x), Math.floor(mob.y), Math.floor(z)) === 'empty' &&
          world.collisionAt(Math.floor(x), Math.floor(mob.y + 1), Math.floor(z)) === 'empty'
        )
          next = { ...next, x, z };
      }
      this.mobs[index] = next;
    }

    this.elapsedSinceSpawn += deltaSeconds;
    let spawned = 0;
    if (this.elapsedSinceSpawn >= SPAWN_INTERVAL_SECONDS && this.mobs.length < MAX_MOBS) {
      this.elapsedSinceSpawn %= SPAWN_INTERVAL_SECONDS;
      spawned = this.trySpawn(player, worldTime, world) ? 1 : 0;
    }
    return { playerDamage, spawned };
  }

  attackNearest(
    player: MobWorldPosition,
    itemId: number | null,
    nowMs: number,
    equipment: EquipmentState,
  ): MobAttackResult {
    let nearestIndex = -1;
    let nearestDistance = ATTACK_REACH;
    for (let index = 0; index < this.mobs.length; index += 1) {
      const mob = this.mobs[index];
      if (!mob) continue;
      const distance = Math.hypot(player.x - mob.x, player.z - mob.z, player.y + 1 - (mob.y + 1));
      if (distance <= nearestDistance) {
        nearestIndex = index;
        nearestDistance = distance;
      }
    }
    const target = this.mobs[nearestIndex];
    if (!target) return emptyAttack(equipment);
    const attack = attackWithMelee(equipment, itemId, nowMs);
    if (!attack.accepted) return emptyAttack(equipment, target.id);
    const remainingHealth = target.health - attack.damage;
    const defeated = remainingHealth <= 0;
    let dropItemId: number | null = null;
    if (defeated) {
      const definition = MOB_DEFINITION_BY_TYPE.get(target.type);
      dropItemId = definition?.dropItemId ?? null;
      this.mobs.splice(nearestIndex, 1);
    } else {
      this.mobs[nearestIndex] = { ...target, health: remainingHealth };
    }
    return {
      accepted: true,
      equipment: attack.state,
      mobId: target.id,
      damage: attack.damage,
      defeated,
      dropItemId,
      weaponBroken: attack.broken,
    };
  }

  private trySpawn(player: MobWorldPosition, worldTime: number, world: CollisionWorld): boolean {
    if (this.mobs.length >= MAX_MOBS) return false;
    const playerFloorY = findFloor(
      Math.floor(player.x),
      Math.floor(player.z),
      Math.floor(player.y),
      world,
    );
    if (playerFloorY === null) return false;
    const playerIsInCave =
      caveColumnStatus(Math.floor(player.x), Math.floor(player.z), playerFloorY, world) === 'cave';
    const minDistance = playerIsInCave ? MIN_CAVE_SPAWN_DISTANCE : MIN_SPAWN_DISTANCE;
    const maxDistance = playerIsInCave ? MAX_CAVE_SPAWN_DISTANCE : MAX_SPAWN_DISTANCE;
    for (let attempt = 0; attempt < SPAWN_ATTEMPTS_PER_TICK; attempt += 1) {
      const angle = this.nextRandom() * Math.PI * 2;
      const radius = minDistance + this.nextRandom() * (maxDistance - minDistance);
      const x = Math.floor(player.x + Math.cos(angle) * radius);
      const z = Math.floor(player.z + Math.sin(angle) * radius);
      const distance = Math.hypot(player.x - x, player.z - z);
      const floorY = findFloor(x, z, Math.floor(player.y), world);
      if (
        floorY === null ||
        !canSpawnMob({ x, z, floorY, playerFloorY, distance }, worldTime, world)
      )
        continue;
      if (
        playerIsInCave &&
        (caveColumnStatus(x, z, floorY, world) !== 'cave' ||
          !hasClearMobPath(player, { x: x + 0.5, y: floorY + 1, z: z + 0.5 }, world))
      )
        continue;
      if (countMobsInChunk(this.mobs, x, z) >= MAX_MOBS_PER_CHUNK) continue;
      const type: MobType = this.nextRandom() < 0.5 ? 'mossling' : 'cinder';
      const definition = MOB_DEFINITION_BY_TYPE.get(type);
      if (!definition) return false;
      this.mobs.push({
        id: this.nextId++,
        type,
        x: x + 0.5,
        y: floorY + 1,
        z: z + 0.5,
        health: definition.maxHealth,
        maxHealth: definition.maxHealth,
        attackCooldown: 0,
      });
      return true;
    }
    return false;
  }

  private nextRandom(): number {
    this.randomState ^= this.randomState << 13;
    this.randomState ^= this.randomState >>> 17;
    this.randomState ^= this.randomState << 5;
    return (this.randomState >>> 0) / 4_294_967_296;
  }
}

function caveColumnStatus(
  x: number,
  z: number,
  floorY: number,
  world: CollisionWorld,
): CaveColumnStatus {
  for (let y = floorY + 3; y < WORLD_HEIGHT; y += 1) {
    const cell = world.collisionAt(x, y, z);
    if (cell === 'unloaded') return 'unloaded';
    if (cell === 'solid') return 'cave';
  }
  return 'open';
}

function hasClearMobPath(
  player: MobWorldPosition,
  candidate: MobWorldPosition,
  world: CollisionWorld,
): boolean {
  const distance = Math.hypot(candidate.x - player.x, candidate.z - player.z);
  const steps = Math.max(1, Math.ceil(distance * 2));
  for (let step = 1; step < steps; step += 1) {
    const amount = step / steps;
    const x = Math.floor(player.x + (candidate.x - player.x) * amount);
    const y = Math.floor(player.y + (candidate.y - player.y) * amount + 0.01);
    const z = Math.floor(player.z + (candidate.z - player.z) * amount);
    if (world.collisionAt(x, y, z) !== 'empty' || world.collisionAt(x, y + 1, z) !== 'empty')
      return false;
  }
  return true;
}

function findFloor(x: number, z: number, aroundY: number, world: CollisionWorld): number | null {
  const start = Math.max(1, Math.min(WORLD_HEIGHT - 4, aroundY + 4));
  for (let offset = 0; offset <= 24; offset += 1) {
    const below = start - offset;
    const above = start + offset;
    for (const y of offset === 0 ? [below] : [below, above]) {
      if (y < 0 || y >= WORLD_HEIGHT - 3) continue;
      if (
        world.collisionAt(x, y, z) === 'solid' &&
        world.collisionAt(x, y + 1, z) === 'empty' &&
        world.collisionAt(x, y + 2, z) === 'empty'
      )
        return y;
    }
  }
  return null;
}

function countMobsInChunk(mobs: readonly MobRecord[], x: number, z: number): number {
  const chunkX = Math.floor(x / 16);
  const chunkZ = Math.floor(z / 16);
  return mobs.filter(
    (mob) => Math.floor(mob.x / 16) === chunkX && Math.floor(mob.z / 16) === chunkZ,
  ).length;
}

function emptyAttack(equipment: EquipmentState, mobId: number | null = null): MobAttackResult {
  return {
    accepted: false,
    equipment,
    mobId,
    damage: 0,
    defeated: false,
    dropItemId: null,
    weaponBroken: false,
  };
}

function hashSeed(seed: number | string): number {
  const text = String(seed);
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}
