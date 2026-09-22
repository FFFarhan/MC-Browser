import { describe, expect, it } from 'vitest';
import { CHUNK_VOLUME } from '../shared/coordinates';
import type { BlockDefinition } from '../world/BlockRegistry';
import { createAtlasPixels } from '../rendering/TextureAtlas';
import { meshChunk } from './faceMesher';
import type { ChunkMeshSnapshot, MeshLayer } from './mesh-types';

const definitions: readonly BlockDefinition[] = [
  {
    id: 0,
    key: 'stonefield:air',
    displayName: 'Air',
    renderLayer: 'invisible',
    collision: 'none',
    replaceable: true,
    hardnessSeconds: 0,
    requiredTool: null,
    minimumToolTier: 'hand',
    emittedLight: 0,
    textures: { top: 'air', bottom: 'air', side: 'air' },
    dropItem: null,
  },
  {
    id: 1,
    key: 'stonefield:stone',
    displayName: 'Stone',
    renderLayer: 'opaque',
    collision: 'solid',
    replaceable: false,
    hardnessSeconds: 1,
    requiredTool: 'pickaxe',
    minimumToolTier: 'wood',
    emittedLight: 0,
    textures: { top: 'stone', bottom: 'stone', side: 'stone' },
    dropItem: 'stonefield:stone',
  },
  {
    id: 2,
    key: 'stonefield:leaves',
    displayName: 'Leaves',
    renderLayer: 'cutout',
    collision: 'none',
    replaceable: true,
    hardnessSeconds: 0.1,
    requiredTool: 'axe',
    minimumToolTier: 'hand',
    emittedLight: 0,
    textures: { top: 'oak_leaves', bottom: 'oak_leaves', side: 'oak_leaves' },
    dropItem: 'stonefield:leaves',
  },
  {
    id: 3,
    key: 'stonefield:water',
    displayName: 'Water',
    renderLayer: 'translucent',
    collision: 'liquid',
    replaceable: true,
    hardnessSeconds: 0,
    requiredTool: null,
    minimumToolTier: 'hand',
    emittedLight: 0,
    textures: { top: 'water_0', bottom: 'water_0', side: 'water_0' },
    dropItem: null,
  },
];

const atlas = createAtlasPixels(7, ['air', 'oak_leaves', 'stone', 'water_0']).manifest;

function snapshot(blocks = new Uint16Array(CHUNK_VOLUME)): ChunkMeshSnapshot {
  return {
    coord: { x: 0, z: 0 },
    blocks,
    revision: 0,
    definitions,
    neighbors: {},
  };
}

function setBlock(blocks: Uint16Array, x: number, y: number, z: number, id: number): void {
  blocks[y * 256 + z * 16 + x] = id;
}

function quadCount(layer: MeshLayer, mesh: ReturnType<typeof meshChunk>): number {
  return mesh[layer].indices.length / 6;
}

describe('reference face mesher', () => {
  it('emits only visible faces for one block and removes the shared face between opaque blocks', () => {
    const one = new Uint16Array(CHUNK_VOLUME);
    setBlock(one, 1, 1, 1, 1);
    const two = one.slice();
    setBlock(two, 2, 1, 1, 1);

    expect(quadCount('opaque', meshChunk(snapshot(one), atlas))).toBe(6);
    expect(quadCount('opaque', meshChunk(snapshot(two), atlas))).toBe(10);
  });

  it('removes every internal face in a dense stone cube', () => {
    const blocks = new Uint16Array(CHUNK_VOLUME);
    for (let y = 1; y < 4; y += 1)
      for (let z = 1; z < 4; z += 1) for (let x = 1; x < 4; x += 1) setBlock(blocks, x, y, z, 1);
    expect(quadCount('opaque', meshChunk(snapshot(blocks), atlas))).toBe(54);
  });

  it('uses neighbor snapshots across chunk edges and treats missing neighbors as open', () => {
    const blocks = new Uint16Array(CHUNK_VOLUME);
    setBlock(blocks, 15, 10, 4, 1);
    const westBlocks = new Uint16Array(CHUNK_VOLUME);
    setBlock(westBlocks, 15, 10, 4, 1);
    const eastBlocks = new Uint16Array(CHUNK_VOLUME);
    setBlock(eastBlocks, 0, 10, 4, 1);

    expect(quadCount('opaque', meshChunk(snapshot(blocks), atlas))).toBe(6);
    expect(
      quadCount(
        'opaque',
        meshChunk({ ...snapshot(blocks), neighbors: { east: eastBlocks } }, atlas),
      ),
    ).toBe(5);
    expect(
      quadCount(
        'opaque',
        meshChunk({ ...snapshot(blocks), neighbors: { west: westBlocks } }, atlas),
      ),
    ).toBe(6);
  });

  it('suppresses shared identical cutout and translucent faces but retains block attributes', () => {
    const leaves = new Uint16Array(CHUNK_VOLUME);
    setBlock(leaves, 1, 2, 1, 2);
    setBlock(leaves, 2, 2, 1, 2);
    const water = new Uint16Array(CHUNK_VOLUME);
    setBlock(water, 1, 2, 1, 3);
    setBlock(water, 2, 2, 1, 3);

    const leafMesh = meshChunk(snapshot(leaves), atlas);
    const waterMesh = meshChunk(snapshot(water), atlas);
    expect(quadCount('cutout', leafMesh)).toBe(10);
    expect(quadCount('translucent', waterMesh)).toBe(10);
    expect(leafMesh.cutout.positions).toHaveLength(10 * 4 * 3);
    expect(leafMesh.cutout.uvs).toHaveLength(10 * 4 * 2);
    expect(leafMesh.cutout.light).toHaveLength(10 * 4);
  });

  it('rejects unknown block IDs rather than emitting malformed geometry', () => {
    const blocks = new Uint16Array(CHUNK_VOLUME);
    setBlock(blocks, 1, 1, 1, 500);

    expect(() => meshChunk(snapshot(blocks), atlas)).toThrow(RangeError);
  });
});
