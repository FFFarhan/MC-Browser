import { describe, expect, it } from 'vitest';
import { createAtlasPixels } from '../rendering/TextureAtlas';
import { meshChunk } from '../meshing/faceMesher';
import { createDemoWorld } from './demoWorld';
import { DEFAULT_BLOCK_DEFINITIONS, DEFAULT_BLOCKS } from './defaultBlocks';
import { DEFAULT_ITEM_DEFINITIONS } from './ItemRegistry';

describe('starter world content', () => {
  it('keeps the required release block catalog resolvable through the procedural atlas', () => {
    const atlas = createAtlasPixels('catalog-check');
    for (const block of DEFAULT_BLOCK_DEFINITIONS) {
      for (const texture of Object.values(block.textures)) {
        expect(atlas.manifest.entries[texture], `${block.key} → ${texture}`).toBeDefined();
      }
      expect(DEFAULT_BLOCKS.get(block.id)).toEqual(block);
    }
    for (const item of DEFAULT_ITEM_DEFINITIONS)
      expect(
        atlas.manifest.entries[item.iconKey],
        `${item.key} icon ${item.iconKey}`,
      ).toBeDefined();
    expect(DEFAULT_BLOCK_DEFINITIONS).toHaveLength(26);
  });

  it('creates visible opaque and cutout geometry for the first deterministic scene', () => {
    const atlas = createAtlasPixels('preview-check');
    const mesh = meshChunk(createDemoWorld(), atlas.manifest);
    expect(mesh.opaque.indices.length).toBeGreaterThan(0);
    expect(mesh.cutout.indices.length).toBeGreaterThan(0);
  });

  it('uses distinct mining times for soft and hard blocks and leaves bedrock unbreakable', () => {
    expect(DEFAULT_BLOCKS.getByKey('stonefield:grass').hardnessSeconds).toBeLessThan(
      DEFAULT_BLOCKS.getByKey('stonefield:stone').hardnessSeconds,
    );
    expect(DEFAULT_BLOCKS.getByKey('stonefield:iron_ore').hardnessSeconds).toBeGreaterThan(
      DEFAULT_BLOCKS.getByKey('stonefield:stone').hardnessSeconds,
    );
    expect(DEFAULT_BLOCKS.getByKey('stonefield:bedrock').hardnessSeconds).toBe(0);
  });
});
