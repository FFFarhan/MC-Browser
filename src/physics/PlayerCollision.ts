import { CHUNK_SIZE } from '../shared/coordinates';

export type CollisionCell = 'empty' | 'solid' | 'unloaded';
export interface CollisionWorld {
  collisionAt(worldX: number, worldY: number, worldZ: number): CollisionCell;
}
export interface PlayerPosition {
  readonly chunkX: number;
  readonly localX: number;
  readonly y: number;
  readonly chunkZ: number;
  readonly localZ: number;
}
export interface PlayerVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
export interface PlayerCollider {
  readonly radiusX: number;
  readonly radiusZ: number;
  readonly standingHeight: number;
  readonly crouchingHeight: number;
}
export interface SweepResult {
  readonly position: PlayerPosition;
  readonly velocity: PlayerVector;
  readonly grounded: boolean;
}

const AXIS_STEP = 0.2;
const MAX_SWEEP_DISTANCE = 4;
const MAX_COLLIDER_RADIUS = 2;
const MAX_COLLIDER_HEIGHT = 4;
const POSITION_EPSILON = 1e-7;
const COLLISION_EPSILON = 1e-7;

function normalizeHorizontal(chunk: number, local: number): { chunk: number; local: number } {
  const shift = Math.floor(local / CHUNK_SIZE);
  const nextChunk = chunk + shift;
  const nextLocal = local - shift * CHUNK_SIZE;
  if (!Number.isSafeInteger(nextChunk) || nextLocal < 0 || nextLocal >= CHUNK_SIZE) {
    throw new RangeError('Player position exceeds the supported safe world coordinate range');
  }
  return { chunk: nextChunk, local: nextLocal };
}

function movePosition(
  position: PlayerPosition,
  axis: 'x' | 'y' | 'z',
  amount: number,
): PlayerPosition {
  if (axis === 'y') return { ...position, y: position.y + amount };
  if (axis === 'x') {
    const next = normalizeHorizontal(position.chunkX, position.localX + amount);
    return { ...position, chunkX: next.chunk, localX: next.local };
  }
  const next = normalizeHorizontal(position.chunkZ, position.localZ + amount);
  return { ...position, chunkZ: next.chunk, localZ: next.local };
}

function absoluteCell(chunk: number, local: number, offset: number): number | null {
  const value = chunk * CHUNK_SIZE + Math.floor(local + offset);
  return Number.isSafeInteger(value) ? value : null;
}

export function isPlayerAabbBlocked(
  position: PlayerPosition,
  collider: PlayerCollider,
  world: CollisionWorld,
  height = collider.standingHeight,
): boolean {
  validateCollider(collider);
  if (!Number.isFinite(position.y) || !Number.isFinite(height) || height <= 0) return true;
  if (height > MAX_COLLIDER_HEIGHT)
    throw new RangeError('Player collider height exceeds the safe bound');
  const minX = absoluteCell(
    position.chunkX,
    position.localX,
    -collider.radiusX + COLLISION_EPSILON,
  );
  const maxX = absoluteCell(position.chunkX, position.localX, collider.radiusX - COLLISION_EPSILON);
  const minZ = absoluteCell(
    position.chunkZ,
    position.localZ,
    -collider.radiusZ + COLLISION_EPSILON,
  );
  const maxZ = absoluteCell(position.chunkZ, position.localZ, collider.radiusZ - COLLISION_EPSILON);
  if (minX === null || maxX === null || minZ === null || maxZ === null) return true;
  const minY = Math.floor(position.y + COLLISION_EPSILON);
  const maxY = Math.floor(position.y + height - COLLISION_EPSILON);
  for (let y = minY; y <= maxY; y += 1) {
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (world.collisionAt(x, y, z) !== 'empty') return true;
      }
    }
  }
  return false;
}

export function sweepAabb(
  position: PlayerPosition,
  displacement: PlayerVector,
  collider: PlayerCollider,
  world: CollisionWorld,
  height = collider.standingHeight,
): SweepResult {
  validateCollider(collider);
  for (const value of [displacement.x, displacement.y, displacement.z]) {
    if (!Number.isFinite(value) || Math.abs(value) > MAX_SWEEP_DISTANCE) {
      throw new RangeError(
        `Sweep displacement must be finite and no more than ${MAX_SWEEP_DISTANCE} blocks`,
      );
    }
  }
  let current = { ...position };
  const velocity = { x: displacement.x, y: displacement.y, z: displacement.z };
  let grounded = false;
  for (const [axis, distance] of [
    ['x', displacement.x],
    ['z', displacement.z],
    ['y', displacement.y],
  ] as const) {
    if (distance === 0) continue;
    const steps = Math.max(1, Math.ceil(Math.abs(distance) / AXIS_STEP));
    const increment = distance / steps;
    for (let step = 0; step < steps; step += 1) {
      const candidate = movePosition(current, axis, increment);
      if (!isPlayerAabbBlocked(candidate, collider, world, height)) {
        current = candidate;
        continue;
      }
      // Bounded binary search finds a contact point without tunneling through thin blocks.
      let safe = 0;
      let blocked = 1;
      for (let iteration = 0; iteration < 12; iteration += 1) {
        const middle = (safe + blocked) / 2;
        const probe = movePosition(current, axis, increment * middle);
        if (isPlayerAabbBlocked(probe, collider, world, height)) blocked = middle;
        else safe = middle;
      }
      current = movePosition(current, axis, increment * safe);
      if (axis === 'x') velocity.x = 0;
      else if (axis === 'z') velocity.z = 0;
      else {
        if (distance < 0) grounded = true;
        velocity.y = 0;
      }
      break;
    }
  }
  return { position: current, velocity, grounded };
}

function validateCollider(collider: PlayerCollider): void {
  if (
    !Number.isFinite(collider.radiusX) ||
    collider.radiusX <= 0 ||
    collider.radiusX > MAX_COLLIDER_RADIUS ||
    !Number.isFinite(collider.radiusZ) ||
    collider.radiusZ <= 0 ||
    collider.radiusZ > MAX_COLLIDER_RADIUS ||
    !Number.isFinite(collider.standingHeight) ||
    collider.standingHeight <= 0 ||
    collider.standingHeight > MAX_COLLIDER_HEIGHT ||
    !Number.isFinite(collider.crouchingHeight) ||
    collider.crouchingHeight <= 0 ||
    collider.crouchingHeight > collider.standingHeight
  ) {
    throw new RangeError('Player collider dimensions exceed safe bounds');
  }
}

export function findSafeSpawn(
  worldX: number,
  worldZ: number,
  startY: number,
  collider: PlayerCollider,
  world: CollisionWorld,
): PlayerPosition {
  if (!Number.isSafeInteger(worldX) || !Number.isSafeInteger(worldZ) || !Number.isInteger(startY)) {
    throw new RangeError('Safe-spawn coordinates must be integers');
  }
  const chunkX = Math.floor(worldX / CHUNK_SIZE);
  const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
  const localX = worldX - chunkX * CHUNK_SIZE + 0.5;
  const localZ = worldZ - chunkZ * CHUNK_SIZE + 0.5;
  const maxY = Math.max(1, Math.min(191, startY));
  for (let groundY = maxY - 1; groundY >= 0; groundY -= 1) {
    if (world.collisionAt(worldX, groundY, worldZ) === 'empty') continue;
    const position = { chunkX, localX, y: groundY + 1, chunkZ, localZ };
    if (!isPlayerAabbBlocked(position, collider, world)) return position;
  }
  throw new Error('No safe player spawn could be found in the requested column');
}

export function playerPositionToWorld(position: PlayerPosition): {
  x: number;
  y: number;
  z: number;
} {
  const x = position.chunkX * CHUNK_SIZE + position.localX;
  const z = position.chunkZ * CHUNK_SIZE + position.localZ;
  if (!Number.isSafeInteger(Math.floor(x)) || !Number.isSafeInteger(Math.floor(z))) {
    throw new RangeError('Player position exceeds safe integer world coordinates');
  }
  return { x, y: position.y, z };
}

export const PLAYER_POSITION_EPSILON = POSITION_EPSILON;
