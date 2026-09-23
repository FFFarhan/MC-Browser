import { chunkKey } from '../shared/chunk-key';
import { WORLD_HEIGHT, worldBlockIndex, worldToChunk } from '../shared/coordinates';
import type { ChunkMeshSnapshot } from '../meshing/mesh-types';
import type { CollisionWorld } from './PlayerCollision';

export function createChunkCollisionWorld(
  chunks: ReadonlyMap<string, ChunkMeshSnapshot>,
): CollisionWorld {
  const definitions = new Map(
    [...chunks.values()].flatMap((chunk) => chunk.definitions.map((block) => [block.id, block])),
  );
  return {
    collisionAt(worldX, worldY, worldZ) {
      if (worldY < 0) return 'solid';
      if (worldY >= WORLD_HEIGHT) return 'empty';
      if (!Number.isInteger(worldY)) return 'solid';
      const position = worldToChunk(worldX, worldZ);
      const chunk = chunks.get(chunkKey(position.chunk));
      if (!chunk) return 'unloaded';
      const id = chunk.blocks[worldBlockIndex(position.localX, worldY, position.localZ)] ?? 0;
      const definition = definitions.get(id);
      return definition?.collision === 'solid' ? 'solid' : definition ? 'empty' : 'solid';
    },
  };
}
