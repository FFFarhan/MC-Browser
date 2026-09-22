import { CHUNK_SIZE, type ChunkCoord } from '../shared/coordinates';

export interface WorldChunkPosition {
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly localX: number;
  readonly localZ: number;
  readonly y: number;
}

export interface RenderPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export class OriginManager {
  private origin: ChunkCoord = { x: 0, z: 0 };

  constructor(private readonly rebaseThresholdChunks = 8) {
    if (!Number.isSafeInteger(rebaseThresholdChunks) || rebaseThresholdChunks < 1) {
      throw new RangeError('Rebase threshold must be a positive safe integer');
    }
  }

  rebaseIfNeeded(playerChunk: ChunkCoord): boolean {
    if (!Number.isSafeInteger(playerChunk.x) || !Number.isSafeInteger(playerChunk.z)) {
      throw new RangeError('Player chunk coordinates must be safe integers');
    }
    if (
      Math.abs(playerChunk.x - this.origin.x) <= this.rebaseThresholdChunks &&
      Math.abs(playerChunk.z - this.origin.z) <= this.rebaseThresholdChunks
    ) {
      return false;
    }
    this.origin = { x: playerChunk.x, z: playerChunk.z };
    return true;
  }

  toRenderPosition(position: WorldChunkPosition): RenderPosition {
    if (
      !Number.isSafeInteger(position.chunkX) ||
      !Number.isSafeInteger(position.chunkZ) ||
      !Number.isFinite(position.localX) ||
      position.localX < 0 ||
      position.localX >= CHUNK_SIZE ||
      !Number.isFinite(position.localZ) ||
      position.localZ < 0 ||
      position.localZ >= CHUNK_SIZE ||
      !Number.isFinite(position.y)
    ) {
      throw new RangeError('World chunk position is invalid');
    }

    const deltaX = position.chunkX - this.origin.x;
    const deltaZ = position.chunkZ - this.origin.z;
    if (!Number.isSafeInteger(deltaX) || !Number.isSafeInteger(deltaZ)) {
      throw new RangeError('World chunk position is too far from the floating origin');
    }
    return {
      x: deltaX * CHUNK_SIZE + position.localX,
      y: position.y,
      z: deltaZ * CHUNK_SIZE + position.localZ,
    };
  }

  getOrigin(): ChunkCoord {
    return { ...this.origin };
  }
}
