import { describe, expect, it } from 'vitest';
import { DEFAULT_HOTBAR_ITEM_IDS } from './ItemRegistry';
import { WorldCatalogError, createWorld, listWorlds, loadWorld, saveWorld } from './WorldCatalog';
import { WORLD_SAVE_KEY, type WorldSave } from './WorldSave';
import { BLOCK_ID } from './defaultBlocks';

class MemoryStorage {
  readonly values = new Map<string, string>();
  failSet = false;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failSet) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    this.values.set(key, value);
  }
}

const testSave = (worldId: string, worldName: string, seed: string): WorldSave => ({
  version: 3,
  worldId,
  worldName,
  seed,
  worldTime: 700,
  player: { chunkX: -2, chunkZ: 4, localX: 2, localZ: 13, y: 70, yaw: 0.2, pitch: -0.1 },
  inventory: [{ itemId: BLOCK_ID['stone'] ?? 0, count: 4 }],
  mutations: [{ x: -32, y: 68, z: 64, blockId: BLOCK_ID['oak_planks'] ?? 0 }],
  survival: {
    health: 18,
    hunger: 15,
    activityProgress: 0,
    starvationProgress: 0,
    regenerationProgress: 0,
  },
  hotbar: DEFAULT_HOTBAR_ITEM_IDS,
  durability: [],
  gameMode: 'survival',
});

describe('named world catalog', () => {
  it('creates distinct named worlds and keeps their seeds and saves isolated', () => {
    const storage = new MemoryStorage();
    const initialWorlds = listWorlds(storage);
    const first = createWorld(storage, { name: 'Cedar', seed: 'cedar-seed' }, () => 'cedar');
    const second = createWorld(storage, { name: 'Basalt', seed: 'basalt-seed' }, () => 'basalt');
    expect(listWorlds(storage)).toEqual([...initialWorlds, first, second]);

    expect(saveWorld(storage, first.id, testSave(first.id, first.name, 'cedar-seed'))).toEqual({
      ok: true,
    });
    expect(saveWorld(storage, second.id, testSave(second.id, second.name, 'basalt-seed'))).toEqual({
      ok: true,
    });
    expect(loadWorld(storage, first.id)?.seed).toBe('cedar-seed');
    expect(loadWorld(storage, second.id)?.seed).toBe('basalt-seed');
  });

  it('migrates an existing single-world save into the initial catalog without losing it', () => {
    const storage = new MemoryStorage();
    const save = testSave('legacy-world', 'Quiet Valley', 'original-seed');
    const legacy: Record<string, unknown> = { ...save, version: 1 };
    delete legacy['worldId'];
    delete legacy['worldName'];
    delete legacy['hotbar'];
    storage.values.set(WORLD_SAVE_KEY, JSON.stringify(legacy));

    const [summary] = listWorlds(storage);
    expect(summary).toMatchObject({
      id: 'world-legacy',
      name: 'Quiet Valley',
      seed: 'original-seed',
    });
    expect(loadWorld(storage, 'world-legacy')).toMatchObject({
      seed: 'original-seed',
      player: legacy['player'],
      inventory: legacy['inventory'],
      mutations: legacy['mutations'],
    });
  });

  it('rejects invalid names, malformed catalogs, and duplicate world IDs', () => {
    const storage = new MemoryStorage();
    expect(() => createWorld(storage, { name: '  ' }, () => 'bad')).toThrow(WorldCatalogError);
    expect(() =>
      createWorld(storage, { name: 'Valid', seed: 'x'.repeat(81) }, () => 'bad'),
    ).toThrow(WorldCatalogError);
    createWorld(storage, { name: 'One', seed: 'one' }, () => 'same');
    expect(() => createWorld(storage, { name: 'Two', seed: 'two' }, () => 'same')).toThrow(
      WorldCatalogError,
    );
    storage.values.set('stonefield.worlds.v1', '{');
    expect(() => listWorlds(storage)).toThrow(WorldCatalogError);
  });

  it('leaves the catalog unchanged when the browser rejects a create or save', () => {
    const storage = new MemoryStorage();
    const world = createWorld(storage, { name: 'Stable', seed: 'stable' }, () => 'stable');
    const catalogBefore = storage.getItem('stonefield.worlds.v1');
    storage.failSet = true;
    expect(() =>
      createWorld(storage, { name: 'Cannot Save', seed: 'other' }, () => 'other'),
    ).toThrow(WorldCatalogError);
    expect(saveWorld(storage, world.id, testSave(world.id, world.name, 'stable'))).toEqual({
      ok: false,
      reason: 'storage',
    });
    expect(storage.getItem('stonefield.worlds.v1')).toBe(catalogBefore);
  });

  it('returns no world save for an unsaved catalog entry and rejects unknown IDs', () => {
    const storage = new MemoryStorage();
    const world = createWorld(storage, { name: 'Fresh', seed: 'fresh' }, () => 'fresh');
    expect(loadWorld(storage, world.id)).toBeNull();
    expect(() => loadWorld(storage, 'missing')).toThrow(WorldCatalogError);
  });
});
