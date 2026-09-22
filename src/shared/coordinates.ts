export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 192;
export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
export const CHUNK_VOLUME = CHUNK_AREA * WORLD_HEIGHT;
export const CHUNK_BLOCK_COUNT = CHUNK_VOLUME;

export interface ChunkCoord {
  readonly x: number;
  readonly z: number;
}

export interface WorldChunkPosition {
  readonly chunk: ChunkCoord;
  readonly localX: number;
  readonly localZ: number;
}

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer`);
  }
}

export function worldToChunk(x: number, z: number): WorldChunkPosition {
  assertSafeInteger(x, 'world x');
  assertSafeInteger(z, 'world z');

  const chunkX = Math.floor(x / CHUNK_SIZE);
  const chunkZ = Math.floor(z / CHUNK_SIZE);
  return {
    chunk: { x: chunkX, z: chunkZ },
    localX: x - chunkX * CHUNK_SIZE,
    localZ: z - chunkZ * CHUNK_SIZE,
  };
}

export function worldBlockIndex(localX: number, y: number, localZ: number): number {
  if (
    !Number.isInteger(localX) ||
    localX < 0 ||
    localX >= CHUNK_SIZE ||
    !Number.isInteger(localZ) ||
    localZ < 0 ||
    localZ >= CHUNK_SIZE ||
    !Number.isInteger(y) ||
    y < 0 ||
    y >= WORLD_HEIGHT
  ) {
    throw new RangeError('Local block coordinates are outside the chunk');
  }

  return y * CHUNK_AREA + localZ * CHUNK_SIZE + localX;
}
