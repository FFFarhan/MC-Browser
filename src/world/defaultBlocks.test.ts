import { describe, expect, it } from 'vitest';
import { createAtlasPixels } from '../rendering/TextureAtlas';
import { meshChunk } from '../meshing/faceMesher';
import { createDemoWorld } from './demoWorld';
import { DEFAULT_BLOCK_DEFINITIONS, DEFAULT_BLOCKS } from './defaultBlocks';

describe('starter world content', () => {
  it('keeps the required release block catalog resolvable through the procedural atlas', () => {
    const atlas = createAtlasPixels('catalog-check');
    for (const block of DEFAULT_BLOCK_DEFINITIONS) {
      for (const texture of Object.values(block.textures)) {
        expect(atlas.manifest.entries[texture], `${block.key} → ${texture}`).toBeDefined();
      }
      expect(DEFAULT_BLOCKS.get(block.id)).toEqual(block);
    }
    expect(DEFAULT_BLOCK_DEFINITIONS).toHaveLength(26);
  });

  it('creates visible opaque and cutout geometry for the first deterministic scene', () => {
    const atlas = createAtlasPixels('preview-check');
    const mesh = meshChunk(createDemoWorld(), atlas.manifest);
    expect(mesh.opaque.indices.length).toBeGreaterThan(0);
    expect(mesh.cutout.indices.length).toBeGreaterThan(0);
  });
});
