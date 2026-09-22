import { CHUNK_VOLUME, worldBlockIndex, type ChunkCoord } from '../shared/coordinates';
import { chunkKey } from '../shared/chunk-key';

export interface SerializedChunk {
  readonly coord: ChunkCoord;
  readonly blocks: Uint16Array;
  readonly revision: number;
}

export class ChunkData {
  private readonly blockIds: Uint16Array;
  private currentRevision: number;

  constructor(
    readonly coord: ChunkCoord,
    initialBlocks?: Uint16Array,
    revision = 0,
  ) {
    chunkKey(coord);
    if (initialBlocks && initialBlocks.length !== CHUNK_VOLUME) {
      throw new RangeError(`Chunk block data must contain ${CHUNK_VOLUME} entries`);
    }
    if (!Number.isSafeInteger(revision) || revision < 0) {
      throw new RangeError('Chunk revision must be a non-negative safe integer');
    }
    this.blockIds = initialBlocks ? initialBlocks.slice() : new Uint16Array(CHUNK_VOLUME);
    this.currentRevision = revision;
  }

  get revision(): number {
    return this.currentRevision;
  }

  get blocks(): Uint16Array {
    return this.blockIds.slice();
  }

  get(localX: number, y: number, localZ: number): number {
    return this.blockIds[worldBlockIndex(localX, y, localZ)] ?? 0;
  }

  set(localX: number, y: number, localZ: number, blockId: number): void {
    if (!Number.isInteger(blockId) || blockId < 0 || blockId > 65_535) {
      throw new RangeError(`Block id must be an unsigned 16-bit integer: ${blockId}`);
    }
    const index = worldBlockIndex(localX, y, localZ);
    if (this.blockIds[index] === blockId) return;
    if (this.currentRevision >= Number.MAX_SAFE_INTEGER) {
      throw new RangeError('Chunk revision cannot advance beyond the safe integer limit');
    }
    this.blockIds[index] = blockId;
    this.currentRevision += 1;
  }

  serialize(): SerializedChunk {
    return {
      coord: { ...this.coord },
      blocks: this.blockIds.slice(),
      revision: this.currentRevision,
    };
  }

  static deserialize(data: SerializedChunk): ChunkData {
    return new ChunkData(data.coord, data.blocks, data.revision);
  }
}
