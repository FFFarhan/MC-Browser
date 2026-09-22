import type { ChunkCoord } from '../shared/coordinates';
import type { AtlasManifest } from '../rendering/TextureAtlas';
import type { BlockDefinition } from '../world/BlockRegistry';

export type MeshLayer = 'opaque' | 'cutout' | 'translucent';
export type NeighborDirection = 'north' | 'south' | 'east' | 'west';

export interface MeshBuffers {
  readonly positions: Float32Array;
  readonly normals: Int8Array;
  readonly uvs: Float32Array;
  readonly indices: Uint16Array | Uint32Array;
  readonly light: Uint8Array;
}

export interface ChunkMeshBuffers {
  readonly opaque: MeshBuffers;
  readonly cutout: MeshBuffers;
  readonly translucent: MeshBuffers;
}

export interface ChunkMeshSnapshot {
  readonly coord: ChunkCoord;
  readonly blocks: Uint16Array;
  readonly revision: number;
  readonly definitions: readonly BlockDefinition[];
  readonly neighbors: Partial<Readonly<Record<NeighborDirection, Uint16Array>>>;
}

export type { AtlasManifest };
