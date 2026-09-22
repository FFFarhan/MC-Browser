import type { ChunkCoord } from './coordinates';

export function chunkKey(coord: ChunkCoord): string {
  if (!Number.isSafeInteger(coord.x) || !Number.isSafeInteger(coord.z)) {
    throw new RangeError('Chunk coordinates must be safe integers');
  }

  return `${coord.x},${coord.z}`;
}
