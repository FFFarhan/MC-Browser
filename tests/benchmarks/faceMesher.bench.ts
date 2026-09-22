import { bench, describe } from 'vitest';
import { CHUNK_VOLUME } from '../../src/shared/coordinates';
import { createAtlasPixels } from '../../src/rendering/TextureAtlas';
import { meshChunk } from '../../src/meshing/faceMesher';
import { DEFAULT_BLOCK_DEFINITIONS } from '../../src/world/defaultBlocks';

const blocks = new Uint16Array(CHUNK_VOLUME);
for (let y = 1; y < 17; y += 1)
  for (let z = 0; z < 16; z += 1) for (let x = 0; x < 16; x += 1) blocks[y * 256 + z * 16 + x] = 3;
const atlas = createAtlasPixels('mesher-benchmark').manifest;
const snapshot = {
  coord: { x: 0, z: 0 },
  blocks,
  revision: 0,
  definitions: DEFAULT_BLOCK_DEFINITIONS,
  neighbors: {},
} as const;

describe('reference chunk mesher', () => {
  bench('mesh a dense 16×16×16 stone chunk without internal faces', () => {
    meshChunk(snapshot, atlas);
  });
});
