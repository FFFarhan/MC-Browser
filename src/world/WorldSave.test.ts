import { describe, expect, it } from 'vitest';
import { WORLD_HEIGHT } from '../shared/coordinates';
import { BLOCK_ID } from './defaultBlocks';
import { DEFAULT_HOTBAR_ITEM_IDS, ITEM_ID } from './ItemRegistry';
import { decodeWorldSave, encodeWorldSave, writeWorldSave, type WorldSave } from './WorldSave';

const save: WorldSave = {
  version: 3,
  worldId: 'test-world',
  worldName: 'Test World',
  seed: 'seed-42',
  worldTime: 713.5,
  player: { chunkX: -3, chunkZ: 2, localX: 0.25, localZ: 15.75, y: 74, yaw: 1.2, pitch: -0.2 },
  inventory: [{ itemId: ITEM_ID['oak_log'] ?? 0, count: 12 }],
  mutations: [{ x: -48, y: 73, z: 32, blockId: BLOCK_ID['oak_planks'] ?? 0 }],
  survival: {
    health: 16,
    hunger: 12,
    activityProgress: 12.5,
    starvationProgress: 0,
    regenerationProgress: 4,
  },
  hotbar: DEFAULT_HOTBAR_ITEM_IDS,
  durability: [{ itemId: ITEM_ID['wooden_pickaxe'] ?? 0, remaining: 37 }],
  gameMode: 'survival',
};

describe('world save codec', () => {
  it('defaults earlier saves to Survival and preserves Creative mode in new saves', () => {
    const previous = decodeWorldSave(JSON.stringify({ ...save, version: 2 }));
    const creative = decodeWorldSave(JSON.stringify({ ...save, version: 3, gameMode: 'creative' }));

    expect(previous).toMatchObject({ version: 3, gameMode: 'survival' });
    expect(creative).toMatchObject({ version: 3, gameMode: 'creative' });
  });

  it('round-trips player, inventory, time, survival, and negative-coordinate edits', () => {
    expect(decodeWorldSave(encodeWorldSave(save))).toEqual(save);
  });

  it('stores a large mutation journal compactly while loading old object-form saves', () => {
    const mutations = Array.from({ length: 80_000 }, (_, index) => ({
      x: index - 20_000,
      y: index % WORLD_HEIGHT,
      z: -3,
      blockId: BLOCK_ID['stone'] ?? 0,
    }));
    const largeSave = { ...save, mutations };
    const encoded = encodeWorldSave(largeSave);

    expect(encoded.length).toBeLessThan(2_000_000);
    expect(decodeWorldSave(encoded)).toEqual(largeSave);
    expect(decodeWorldSave(JSON.stringify(save))).toEqual(save);
  });

  it('reports whether saving failed from an oversized payload or storage rejection', () => {
    const storageFailure = writeWorldSave(
      {
        setItem: () => {
          throw new DOMException('Quota exceeded', 'QuotaExceededError');
        },
      },
      save,
    );
    expect(storageFailure).toEqual({ ok: false, reason: 'storage' });

    const tooManyMutations = {
      ...save,
      mutations: Array.from({ length: 200_000 }, (_, index) => ({
        x: index * 16,
        y: index % WORLD_HEIGHT,
        z: index,
        blockId: BLOCK_ID['stone'] ?? 0,
      })),
    };
    const sizeFailure = writeWorldSave({ setItem: () => undefined }, tooManyMutations);
    expect(sizeFailure).toEqual({ ok: false, reason: 'too-large' });
  });

  it('rejects malformed or unsafe save data before world creation', () => {
    expect(decodeWorldSave('{')).toBeNull();
    expect(decodeWorldSave(JSON.stringify({ ...save, version: 99 }))).toBeNull();
    expect(
      decodeWorldSave(
        JSON.stringify({ ...save, mutations: [{ x: 0, y: WORLD_HEIGHT, z: 0, blockId: 1 }] }),
      ),
    ).toBeNull();
    expect(
      decodeWorldSave(JSON.stringify({ ...save, inventory: [{ itemId: 65_534, count: 1 }] })),
    ).toBeNull();
  });

  it('rejects duplicate mutated positions and unreasonable input sizes', () => {
    const duplicate = { ...save, mutations: [save.mutations[0], save.mutations[0]] };
    expect(decodeWorldSave(JSON.stringify(duplicate))).toBeNull();
    expect(decodeWorldSave('x'.repeat(2_000_001))).toBeNull();
  });

  it('loads earlier saves with safe full survival defaults and rejects unsafe stats', () => {
    const earlierSave: Record<string, unknown> = { ...save };
    delete earlierSave['survival'];
    expect(decodeWorldSave(JSON.stringify(earlierSave))?.survival).toEqual({
      health: 20,
      hunger: 20,
      activityProgress: 0,
      starvationProgress: 0,
      regenerationProgress: 0,
    });
    expect(
      decodeWorldSave(JSON.stringify({ ...save, survival: { ...save.survival, health: 21 } })),
    ).toBeNull();
  });

  it('migrates a v1 world without changing its seed, pose, inventory, time, survival, or edits', () => {
    const legacy: Record<string, unknown> = { ...save, version: 1 };
    delete legacy['worldId'];
    delete legacy['worldName'];
    delete legacy['hotbar'];
    delete legacy['durability'];
    const migrated = decodeWorldSave(JSON.stringify(legacy));
    expect(migrated).toMatchObject({
      version: 3,
      worldId: 'legacy-world',
      worldName: 'Quiet Valley',
      seed: save.seed,
      worldTime: save.worldTime,
      player: save.player,
      inventory: save.inventory,
      mutations: save.mutations,
      survival: save.survival,
      hotbar: DEFAULT_HOTBAR_ITEM_IDS,
      durability: [],
      gameMode: 'survival',
    });
  });

  it('rejects invalid durability and stackable tool inventory counts', () => {
    expect(
      decodeWorldSave(
        JSON.stringify({
          ...save,
          durability: [{ itemId: ITEM_ID['wooden_pickaxe'], remaining: 999 }],
        }),
      ),
    ).toBeNull();
    expect(
      decodeWorldSave(
        JSON.stringify({
          ...save,
          inventory: [{ itemId: ITEM_ID['wooden_pickaxe'], count: 2 }],
        }),
      ),
    ).toBeNull();
  });
});
