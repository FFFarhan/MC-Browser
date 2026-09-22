import { describe, expect, it } from 'vitest';
import { BlockRegistry, type BlockDefinition } from './BlockRegistry';

const air: BlockDefinition = {
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
};

describe('BlockRegistry', () => {
  it('requires air at stable id zero and provides deterministic lookups', () => {
    const registry = new BlockRegistry([air]);

    expect(registry.get(0)).toEqual(air);
    expect(registry.getByKey('stonefield:air')).toEqual(air);
    expect(registry.list()).toEqual([air]);
  });

  it('rejects duplicate IDs, duplicate keys, and unknown lookups', () => {
    expect(() => new BlockRegistry([])).toThrow(RangeError);
    expect(() => new BlockRegistry([{ ...air, id: 1 }])).toThrow(RangeError);
    expect(() => new BlockRegistry([air, { ...air, id: 1 }])).toThrow(RangeError);
    expect(() => new BlockRegistry([air, { ...air, id: 1, key: 'stonefield:air' }])).toThrow(
      RangeError,
    );
    expect(() => new BlockRegistry([air]).get(9)).toThrow(RangeError);
  });

  it('requires air to be invisible and non-colliding', () => {
    expect(() => new BlockRegistry([{ ...air, collision: 'solid' }])).toThrow(RangeError);
    expect(() => new BlockRegistry([{ ...air, renderLayer: 'opaque' }])).toThrow(RangeError);
  });
});
