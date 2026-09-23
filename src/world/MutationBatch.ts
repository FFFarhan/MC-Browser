import { CHUNK_VOLUME, WORLD_HEIGHT, worldToChunk } from '../shared/coordinates';
import type { ChunkCoord } from '../shared/coordinates';
import { chunkKey } from '../shared/chunk-key';

export interface BlockChange {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly before: number;
  readonly after: number;
}
export interface ItemDelta {
  readonly itemId: number;
  readonly amount: number;
}
export interface PlaceableDefinition {
  readonly id: number;
  readonly placeable: boolean;
  readonly maxStack?: number | undefined;
}

export class MutationBatch {
  private readonly blockChanges: BlockChange[] = [];
  private readonly itemDeltas: ItemDelta[] = [];

  constructor(readonly expectedRevision: number) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
      throw new RangeError('Mutation revision must be a safe non-negative integer');
  }

  changeBlock(position: BlockChange['position'], before: number, after: number): this {
    this.blockChanges.push({ position: { ...position }, before, after });
    return this;
  }

  changeItem(itemId: number, amount: number): this {
    this.itemDeltas.push({ itemId, amount });
    return this;
  }

  get blocks(): readonly BlockChange[] {
    return this.blockChanges;
  }
  get items(): readonly ItemDelta[] {
    return this.itemDeltas;
  }
}

export class WorldMutationStore {
  private currentRevision = 0;
  private readonly inventory = new Map<number, number>();
  private readonly definitions: Map<number, PlaceableDefinition>;
  private readonly loadedChunks = new Map<string, Uint16Array>();

  constructor(
    readonly coord: ChunkCoord,
    readonly blocks: Uint16Array,
    definitions: readonly PlaceableDefinition[],
    initialInventory: ReadonlyMap<number, number> = new Map(),
  ) {
    if (blocks.length !== CHUNK_VOLUME)
      throw new RangeError('Mutation store received invalid chunk data');
    this.addChunk(coord, blocks);
    this.definitions = new Map(definitions.map((definition) => [definition.id, definition]));
    if (this.definitions.size !== definitions.length)
      throw new RangeError('Mutation block definitions contain duplicate IDs');
    for (const [id, count] of initialInventory) {
      const definition = this.definitions.get(id);
      if (
        !definition ||
        !Number.isSafeInteger(count) ||
        count < 0 ||
        count > (definition.maxStack ?? Number.MAX_SAFE_INTEGER)
      )
        throw new RangeError('Initial inventory is invalid');
      if (count > 0) this.inventory.set(id, count);
    }
  }

  get revision(): number {
    return this.currentRevision;
  }

  getBlock(x: number, y: number, z: number): number | null {
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      !Number.isInteger(z) ||
      y < 0 ||
      y >= WORLD_HEIGHT
    )
      return null;
    const coordinate = worldToChunk(x, z);
    const blocks = this.loadedChunks.get(chunkKey(coordinate.chunk));
    if (!blocks) return null;
    return blocks[y * 256 + coordinate.localZ * 16 + coordinate.localX] ?? 0;
  }

  addChunk(coord: ChunkCoord, blocks: Uint16Array): void {
    if (blocks.length !== CHUNK_VOLUME)
      throw new RangeError('Mutation store received invalid chunk data');
    const key = chunkKey(coord);
    if (this.loadedChunks.has(key)) throw new Error(`Mutation chunk is already loaded: ${key}`);
    this.loadedChunks.set(key, blocks);
  }

  removeChunk(coord: ChunkCoord): boolean {
    if (this.loadedChunks.size <= 1) return false;
    return this.loadedChunks.delete(chunkKey(coord));
  }

  getItemCount(itemId: number): number {
    return this.inventory.get(itemId) ?? 0;
  }

  getInventorySnapshot(): readonly { readonly itemId: number; readonly count: number }[] {
    return [...this.inventory]
      .map(([itemId, count]) => ({ itemId, count }))
      .sort((left, right) => left.itemId - right.itemId);
  }

  commit(batch: MutationBatch): boolean {
    if (
      batch.expectedRevision !== this.currentRevision ||
      this.currentRevision === Number.MAX_SAFE_INTEGER ||
      (batch.blocks.length === 0 && batch.items.length === 0)
    )
      return false;
    const indices = new Set<string>();
    const stagedItems = new Map<number, number>();
    const stagedBlocks: { blocks: Uint16Array; index: number; value: number }[] = [];
    for (const change of batch.blocks) {
      const { x, y, z } = change.position;
      if (!Number.isInteger(y) || y < 0 || y >= WORLD_HEIGHT) return false;
      const coordinate = worldToChunk(x, z);
      const blocks = this.loadedChunks.get(chunkKey(coordinate.chunk));
      if (!blocks) return false;
      const index = y * 256 + coordinate.localZ * 16 + coordinate.localX;
      const blockKey = `${chunkKey(coordinate.chunk)}:${index}`;
      if (
        indices.has(blockKey) ||
        blocks[index] !== change.before ||
        !this.definitions.has(change.after)
      )
        return false;
      indices.add(blockKey);
      stagedBlocks.push({ blocks, index, value: change.after });
    }
    for (const delta of batch.items) {
      if (!this.definitions.has(delta.itemId) || !Number.isSafeInteger(delta.amount)) return false;
      stagedItems.set(delta.itemId, (stagedItems.get(delta.itemId) ?? 0) + delta.amount);
    }
    for (const [itemId, delta] of stagedItems) {
      const next = this.getItemCount(itemId) + delta;
      const definition = this.definitions.get(itemId);
      if (
        !Number.isSafeInteger(next) ||
        next < 0 ||
        next > (definition?.maxStack ?? Number.MAX_SAFE_INTEGER)
      )
        return false;
    }
    for (const block of stagedBlocks) block.blocks[block.index] = block.value;
    for (const [itemId, delta] of stagedItems) {
      const count = this.getItemCount(itemId) + delta;
      if (count === 0) this.inventory.delete(itemId);
      else this.inventory.set(itemId, count);
    }
    this.currentRevision += 1;
    return true;
  }
}

export function commitMutation(store: WorldMutationStore, batch: MutationBatch): boolean {
  return store.commit(batch);
}
