import { WORLD_HEIGHT, worldToChunk, type ChunkCoord } from '../shared/coordinates';
import { chunkKey } from '../shared/chunk-key';
import type { ChunkData } from './ChunkData';

export type BlockLookup =
  | { readonly kind: 'block'; readonly id: number }
  | { readonly kind: 'unloaded'; readonly chunk: ChunkCoord }
  | { readonly kind: 'above' }
  | { readonly kind: 'boundary'; readonly id: number };

export class WorldStore {
  private readonly chunks = new Map<string, ChunkData>();

  constructor(
    private readonly airBlockId: number,
    private readonly bottomBoundaryBlockId: number,
  ) {
    for (const [label, id] of [
      ['air block id', airBlockId],
      ['bottom boundary block id', bottomBoundaryBlockId],
    ] as const) {
      if (!Number.isInteger(id) || id < 0 || id > 65_535) {
        throw new RangeError(`${label} must be an unsigned 16-bit integer`);
      }
    }
  }

  setGeneratedChunk(chunk: ChunkData): void {
    const key = chunkKey(chunk.coord);
    if (this.chunks.has(key)) throw new Error(`Chunk already loaded: ${key}`);
    this.chunks.set(key, chunk);
  }

  getLoadedChunk(coord: ChunkCoord): ChunkData | undefined {
    return this.chunks.get(chunkKey(coord));
  }

  getBlock(worldX: number, y: number, worldZ: number): BlockLookup {
    const position = worldToChunk(worldX, worldZ);
    if (!Number.isInteger(y)) throw new RangeError('World y must be an integer');
    if (y < 0) return { kind: 'boundary', id: this.bottomBoundaryBlockId };
    if (y >= WORLD_HEIGHT) return { kind: 'above' };

    const chunk = this.chunks.get(chunkKey(position.chunk));
    if (!chunk) return { kind: 'unloaded', chunk: position.chunk };
    return { kind: 'block', id: chunk.get(position.localX, y, position.localZ) };
  }

  get loadedChunkCount(): number {
    return this.chunks.size;
  }
}
