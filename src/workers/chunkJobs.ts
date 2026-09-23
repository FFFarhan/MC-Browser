import { meshChunk } from '../meshing/faceMesher';
import type { ChunkMeshBuffers, ChunkMeshSnapshot, NeighborDirection } from '../meshing/mesh-types';
import { createAtlasPixels } from '../rendering/TextureAtlas';
import type { ChunkCoord } from '../shared/coordinates';
import { chunkKey } from '../shared/chunk-key';
import { DEFAULT_BLOCK_DEFINITIONS } from '../world/defaultBlocks';
import { generateChunk } from '../world/ChunkGenerator';

export const CHUNK_WORKER_PROTOCOL_VERSION = 1;
export const MAX_CHUNKS_PER_JOB = 49;
export const CHUNK_ATLAS_SEED = 'stonefield-atlas-v1';

export interface PrepareRegionRequest {
  readonly protocolVersion: 1;
  readonly requestId: number;
  readonly kind: 'prepare-region';
  readonly seed: number | string;
  readonly coords: readonly ChunkCoord[];
}

export interface RebuildChunkRequest {
  readonly protocolVersion: 1;
  readonly requestId: number;
  readonly kind: 'rebuild-chunk';
  readonly snapshot: Omit<ChunkMeshSnapshot, 'definitions'>;
}

export type ChunkWorkerRequest = PrepareRegionRequest | RebuildChunkRequest;

export interface PreparedChunk {
  readonly coord: ChunkCoord;
  readonly blocks: Uint16Array;
  readonly revision: number;
  readonly mesh: ChunkMeshBuffers;
}

export type ChunkWorkerResponse =
  | {
      readonly protocolVersion: 1;
      readonly requestId: number;
      readonly kind: 'prepared-region';
      readonly chunks: readonly PreparedChunk[];
    }
  | {
      readonly protocolVersion: 1;
      readonly requestId: number;
      readonly kind: 'remeshed-chunk';
      readonly coord: ChunkCoord;
      readonly revision: number;
      readonly mesh: ChunkMeshBuffers;
    }
  | {
      readonly protocolVersion: 1;
      readonly requestId: number;
      readonly kind: 'chunk-worker-error';
      readonly message: string;
    };

const NEIGHBOR_OFFSETS: Readonly<Record<NeighborDirection, ChunkCoord>> = {
  north: { x: 0, z: -1 },
  south: { x: 0, z: 1 },
  east: { x: 1, z: 0 },
  west: { x: -1, z: 0 },
};

function neighborsFor(
  snapshot: ChunkMeshSnapshot,
  chunks: ReadonlyMap<string, ChunkMeshSnapshot>,
): ChunkMeshSnapshot {
  const neighbors: Partial<Record<NeighborDirection, Uint16Array>> = {};
  for (const [direction, offset] of Object.entries(NEIGHBOR_OFFSETS) as [
    NeighborDirection,
    ChunkCoord,
  ][]) {
    const neighbor = chunks.get(
      chunkKey({ x: snapshot.coord.x + offset.x, z: snapshot.coord.z + offset.z }),
    );
    if (neighbor) neighbors[direction] = neighbor.blocks;
  }
  return { ...snapshot, neighbors };
}

function validateRegion(coords: readonly ChunkCoord[]): void {
  if (coords.length < 1 || coords.length > MAX_CHUNKS_PER_JOB) {
    throw new RangeError(`Chunk region must contain between 1 and ${MAX_CHUNKS_PER_JOB} chunks`);
  }
  const keys = new Set<string>();
  for (const coord of coords) {
    const key = chunkKey(coord);
    if (keys.has(key)) throw new RangeError(`Chunk region contains a duplicate coordinate: ${key}`);
    keys.add(key);
  }
}

export function handleChunkWorkerJob(request: ChunkWorkerRequest): ChunkWorkerResponse {
  if (
    request.protocolVersion !== CHUNK_WORKER_PROTOCOL_VERSION ||
    !Number.isSafeInteger(request.requestId) ||
    request.requestId < 0
  ) {
    throw new RangeError('Chunk worker request has an invalid protocol version or request ID');
  }

  if (request.kind === 'prepare-region') {
    validateRegion(request.coords);
    const snapshots = request.coords.map((coord) => generateChunk(coord, request.seed));
    const snapshotsByKey = new Map(
      snapshots.map((snapshot) => [chunkKey(snapshot.coord), snapshot]),
    );
    const atlas = createAtlasPixels(CHUNK_ATLAS_SEED).manifest;
    const chunks = snapshots.map((snapshot): PreparedChunk => {
      const withNeighbors = neighborsFor(snapshot, snapshotsByKey);
      return {
        coord: snapshot.coord,
        blocks: snapshot.blocks,
        revision: snapshot.revision,
        mesh: meshChunk(withNeighbors, atlas),
      };
    });
    return {
      protocolVersion: CHUNK_WORKER_PROTOCOL_VERSION,
      requestId: request.requestId,
      kind: 'prepared-region',
      chunks,
    };
  }

  const snapshot: ChunkMeshSnapshot = {
    ...request.snapshot,
    definitions: DEFAULT_BLOCK_DEFINITIONS,
  };
  return {
    protocolVersion: CHUNK_WORKER_PROTOCOL_VERSION,
    requestId: request.requestId,
    kind: 'remeshed-chunk',
    coord: { ...snapshot.coord },
    revision: snapshot.revision,
    mesh: meshChunk(snapshot, createAtlasPixels(CHUNK_ATLAS_SEED).manifest),
  };
}
