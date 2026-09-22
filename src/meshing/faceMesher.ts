import { CHUNK_SIZE, CHUNK_VOLUME, WORLD_HEIGHT } from '../shared/coordinates';
import type { BlockDefinition } from '../world/BlockRegistry';
import type {
  AtlasManifest,
  ChunkMeshBuffers,
  ChunkMeshSnapshot,
  MeshBuffers,
  MeshLayer,
  NeighborDirection,
} from './mesh-types';

const FACES = [
  {
    normal: [1, 0, 0],
    direction: 'east',
    corners: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
  },
  {
    normal: [-1, 0, 0],
    direction: 'west',
    corners: [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
      [0, 0, 0],
    ],
  },
  {
    normal: [0, 1, 0],
    direction: 'up',
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
  },
  {
    normal: [0, -1, 0],
    direction: 'down',
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
  {
    normal: [0, 0, 1],
    direction: 'south',
    corners: [
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
      [0, 0, 1],
    ],
  },
  {
    normal: [0, 0, -1],
    direction: 'north',
    corners: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
  },
] as const;
type Face = (typeof FACES)[number];

function blockAt(snapshot: ChunkMeshSnapshot, x: number, y: number, z: number): number {
  if (y < 0) return -1; // The bedrock boundary is solid; do not mesh the world's bottom.
  if (y >= WORLD_HEIGHT) return 0;
  if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE)
    return snapshot.blocks[y * 256 + z * 16 + x] ?? 0;
  let direction: NeighborDirection;
  let nx = x;
  let nz = z;
  if (x < 0) direction = 'west';
  else if (x >= CHUNK_SIZE) {
    direction = 'east';
    nx = 0;
  } else if (z < 0) direction = 'north';
  else {
    direction = 'south';
    nz = 0;
  }
  if (direction === 'west') nx = CHUNK_SIZE - 1;
  if (direction === 'north') nz = CHUNK_SIZE - 1;
  const blocks = snapshot.neighbors[direction];
  return blocks?.[y * 256 + nz * 16 + nx] ?? 0;
}

function textureFor(definition: BlockDefinition, face: Face): string {
  if (face.direction === 'up') return definition.textures.top;
  if (face.direction === 'down') return definition.textures.bottom;
  return definition.textures.side;
}

function visible(definition: BlockDefinition, neighbor: BlockDefinition | null): boolean {
  if (!neighbor || neighbor.renderLayer === 'invisible') return true;
  if (neighbor.renderLayer === 'opaque') return false;
  return neighbor.id !== definition.id;
}

export function meshChunk(snapshot: ChunkMeshSnapshot, atlas: AtlasManifest): ChunkMeshBuffers {
  if (snapshot.blocks.length !== CHUNK_VOLUME)
    throw new RangeError('Chunk snapshot has invalid block data length');
  const byId = new Map(snapshot.definitions.map((definition) => [definition.id, definition]));
  const vertexData: Record<
    MeshLayer,
    { positions: number[]; normals: number[]; uvs: number[]; indices: number[]; light: number[] }
  > = {
    opaque: { positions: [], normals: [], uvs: [], indices: [], light: [] },
    cutout: { positions: [], normals: [], uvs: [], indices: [], light: [] },
    translucent: { positions: [], normals: [], uvs: [], indices: [], light: [] },
  };
  for (let y = 0; y < WORLD_HEIGHT; y += 1)
    for (let z = 0; z < CHUNK_SIZE; z += 1)
      for (let x = 0; x < CHUNK_SIZE; x += 1) {
        const id = snapshot.blocks[y * 256 + z * 16 + x] ?? 0;
        if (id === 0) continue;
        const definition = byId.get(id);
        if (!definition) throw new RangeError(`Unknown block id: ${id}`);
        if (definition.renderLayer === 'invisible') continue;
        const layer = definition.renderLayer as MeshLayer;
        const output = vertexData[layer];
        for (const face of FACES) {
          const [dx, dy, dz] = face.normal;
          const adjacent = blockAt(snapshot, x + dx, y + dy, z + dz);
          const neighbor =
            adjacent < 0 ? null : (byId.get(adjacent) ?? (adjacent === 0 ? null : undefined));
          if (neighbor === undefined)
            throw new RangeError(`Unknown neighbor block id: ${adjacent}`);
          if (!visible(definition, neighbor)) continue;
          const textureKey = textureFor(definition, face);
          const tile = atlas.entries[textureKey];
          if (!tile) throw new RangeError(`Missing texture in atlas: ${textureKey}`);
          const start = output.positions.length / 3;
          for (const [cx, cy, cz] of face.corners) {
            output.positions.push(x + cx, y + cy, z + cz);
            output.normals.push(...face.normal);
            output.light.push(255);
          }
          output.uvs.push(tile.u0, tile.v0, tile.u0, tile.v1, tile.u1, tile.v1, tile.u1, tile.v0);
          output.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
        }
      }
  const pack = (layer: MeshLayer): MeshBuffers => {
    const data = vertexData[layer];
    const maxIndex = data.positions.length / 3 - 1;
    return {
      positions: new Float32Array(data.positions),
      normals: new Int8Array(data.normals),
      uvs: new Float32Array(data.uvs),
      indices: maxIndex <= 65_535 ? new Uint16Array(data.indices) : new Uint32Array(data.indices),
      light: new Uint8Array(data.light),
    };
  };
  return { opaque: pack('opaque'), cutout: pack('cutout'), translucent: pack('translucent') };
}
