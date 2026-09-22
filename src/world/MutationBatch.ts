import { CHUNK_VOLUME, WORLD_HEIGHT, worldToChunk } from '../shared/coordinates';
import type { ChunkCoord } from '../shared/coordinates';

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

  constructor(
    readonly coord: ChunkCoord,
    readonly blocks: Uint16Array,
    definitions: readonly PlaceableDefinition[],
    initialInventory: ReadonlyMap<number, number> = new Map(),
  ) {
    if (blocks.length !== CHUNK_VOLUME)
      throw new RangeError('Mutation store received invalid chunk data');
    this.definitions = new Map(definitions.map((definition) => [definition.id, definition]));
    if (this.definitions.size !== definitions.length)
      throw new RangeError('Mutation block definitions contain duplicate IDs');
    for (const [id, count] of initialInventory) {
      if (!this.definitions.has(id) || !Number.isSafeInteger(count) || count < 0)
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
    if (coordinate.chunk.x !== this.coord.x || coordinate.chunk.z !== this.coord.z) return null;
    return this.blocks[y * 256 + coordinate.localZ * 16 + coordinate.localX] ?? 0;
  }

  getItemCount(itemId: number): number {
    return this.inventory.get(itemId) ?? 0;
  }

  commit(batch: MutationBatch): boolean {
    if (
      batch.expectedRevision !== this.currentRevision ||
      this.currentRevision === Number.MAX_SAFE_INTEGER ||
      batch.blocks.length === 0
    )
      return false;
    const indices = new Set<number>();
    const stagedItems = new Map<number, number>();
    const stagedBlocks: { index: number; value: number }[] = [];
    for (const change of batch.blocks) {
      const { x, y, z } = change.position;
      if (!Number.isInteger(y) || y < 0 || y >= WORLD_HEIGHT) return false;
      const coordinate = worldToChunk(x, z);
      if (coordinate.chunk.x !== this.coord.x || coordinate.chunk.z !== this.coord.z) return false;
      const index = y * 256 + coordinate.localZ * 16 + coordinate.localX;
      if (
        indices.has(index) ||
        this.blocks[index] !== change.before ||
        !this.definitions.has(change.after)
      )
        return false;
      indices.add(index);
      stagedBlocks.push({ index, value: change.after });
    }
    for (const delta of batch.items) {
      if (!this.definitions.has(delta.itemId) || !Number.isSafeInteger(delta.amount)) return false;
      stagedItems.set(delta.itemId, (stagedItems.get(delta.itemId) ?? 0) + delta.amount);
    }
    for (const [itemId, delta] of stagedItems) {
      const next = this.getItemCount(itemId) + delta;
      if (!Number.isSafeInteger(next) || next < 0) return false;
    }
    for (const block of stagedBlocks) this.blocks[block.index] = block.value;
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
