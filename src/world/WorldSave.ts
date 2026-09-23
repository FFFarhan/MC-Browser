import {
  CHUNK_SIZE,
  CHUNK_VOLUME,
  WORLD_HEIGHT,
  worldBlockIndex,
  worldToChunk,
} from '../shared/coordinates';
import { DEFAULT_BLOCKS } from './defaultBlocks';
import { DEFAULT_HOTBAR_ITEM_IDS, DEFAULT_ITEMS } from './ItemRegistry';
import { createSurvivalState, type SurvivalState } from '../gameplay/Survival';

export const WORLD_SAVE_VERSION = 3;
export const WORLD_SAVE_KEY = 'stonefield.world.v1';
export const WORLD_SAVE_PREFIX = 'stonefield.world.v2.';
const MAX_SAVE_CHARS = 2_000_000;
const MAX_MUTATIONS = 200_000;
type CompactMutation = readonly [chunkX: number, chunkZ: number, index: number, blockId: number];

export type WorldSaveWriteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'invalid' | 'too-large' | 'storage' };

export class WorldSaveError extends Error {
  constructor(
    readonly reason: 'invalid' | 'too-large',
    message: string,
  ) {
    super(message);
    this.name = 'WorldSaveError';
  }
}

export interface SavedPlayer {
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly localX: number;
  readonly localZ: number;
  readonly y: number;
  readonly yaw: number;
  readonly pitch: number;
}

export interface SavedInventoryItem {
  readonly itemId: number;
  readonly count: number;
}

export interface SavedDurability {
  readonly itemId: number;
  readonly remaining: number;
}

export interface SavedBlockMutation {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly blockId: number;
}

export type SavedSurvival = SurvivalState;

export interface WorldSave {
  readonly version: 3;
  readonly worldId: string;
  readonly worldName: string;
  readonly seed: number | string;
  readonly worldTime: number;
  readonly player: SavedPlayer;
  readonly inventory: readonly SavedInventoryItem[];
  readonly mutations: readonly SavedBlockMutation[];
  readonly survival: SavedSurvival;
  readonly hotbar: readonly (number | null)[];
  readonly durability: readonly SavedDurability[];
  readonly gameMode: 'survival' | 'creative';
}

function validWorldId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
}

function validWorldName(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > 32)
    return false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) return false;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function validPlayer(value: unknown): value is SavedPlayer {
  if (!isRecord(value)) return false;
  return (
    isSafeInt(value['chunkX']) &&
    isSafeInt(value['chunkZ']) &&
    Number.isSafeInteger(value['chunkX'] * 16) &&
    Number.isSafeInteger(value['chunkZ'] * 16) &&
    typeof value['localX'] === 'number' &&
    Number.isFinite(value['localX']) &&
    value['localX'] >= 0 &&
    value['localX'] < 16 &&
    typeof value['localZ'] === 'number' &&
    Number.isFinite(value['localZ']) &&
    value['localZ'] >= 0 &&
    value['localZ'] < 16 &&
    typeof value['y'] === 'number' &&
    Number.isFinite(value['y']) &&
    value['y'] >= 0 &&
    value['y'] < WORLD_HEIGHT &&
    typeof value['yaw'] === 'number' &&
    Number.isFinite(value['yaw']) &&
    Math.abs(value['yaw']) <= Math.PI * 4 &&
    typeof value['pitch'] === 'number' &&
    Number.isFinite(value['pitch']) &&
    Math.abs(value['pitch']) < Math.PI / 2
  );
}

function decodeMutation(entry: unknown): SavedBlockMutation | null {
  let x: number;
  let y: number;
  let z: number;
  let blockId: number;
  if (Array.isArray(entry)) {
    if (
      entry.length !== 4 ||
      !isSafeInt(entry[0]) ||
      !isSafeInt(entry[1]) ||
      !isSafeInt(entry[2]) ||
      !isSafeInt(entry[3]) ||
      !Number.isSafeInteger(entry[0] * CHUNK_SIZE) ||
      !Number.isSafeInteger(entry[1] * CHUNK_SIZE) ||
      entry[2] < 0 ||
      entry[2] >= CHUNK_VOLUME
    )
      return null;
    const [chunkX, chunkZ, index, id] = entry as unknown as CompactMutation;
    x = chunkX * CHUNK_SIZE + (index % CHUNK_SIZE);
    y = Math.floor(index / (CHUNK_SIZE * CHUNK_SIZE));
    z = chunkZ * CHUNK_SIZE + (Math.floor(index / CHUNK_SIZE) % CHUNK_SIZE);
    blockId = id;
  } else {
    if (
      !isRecord(entry) ||
      !isSafeInt(entry['x']) ||
      !isSafeInt(entry['y']) ||
      !isSafeInt(entry['z']) ||
      !isSafeInt(entry['blockId'])
    )
      return null;
    ({ x, y, z, blockId } = entry as unknown as SavedBlockMutation);
  }
  if (y < 0 || y >= WORLD_HEIGHT) return null;
  try {
    DEFAULT_BLOCKS.get(blockId);
  } catch {
    return null;
  }
  return { x, y, z, blockId };
}

export function decodeWorldSave(raw: string | null): WorldSave | null {
  if (!raw || raw.length > MAX_SAVE_CHARS) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      (value['version'] !== 1 &&
        value['version'] !== 2 &&
        value['version'] !== WORLD_SAVE_VERSION) ||
      !(
        typeof value['seed'] === 'string' ||
        (typeof value['seed'] === 'number' && Number.isFinite(value['seed']))
      ) ||
      (typeof value['seed'] === 'string' && (!value['seed'].trim() || value['seed'].length > 80)) ||
      typeof value['worldTime'] !== 'number' ||
      !Number.isFinite(value['worldTime']) ||
      value['worldTime'] < 0 ||
      value['worldTime'] >= 1_200 ||
      !validPlayer(value['player']) ||
      !Array.isArray(value['inventory']) ||
      value['inventory'].length > 256 ||
      !Array.isArray(value['mutations']) ||
      value['mutations'].length > MAX_MUTATIONS
    ) {
      return null;
    }

    const version = value['version'];
    const gameMode = version === 3 ? value['gameMode'] : 'survival';
    const worldId = version === 1 ? 'legacy-world' : value['worldId'];
    const worldName = version === 1 ? 'Quiet Valley' : value['worldName'];
    const hotbar = version === 1 ? [...DEFAULT_HOTBAR_ITEM_IDS] : value['hotbar'];
    const durabilityValue = version === 1 ? [] : (value['durability'] ?? []);
    if (
      !validWorldId(worldId) ||
      !validWorldName(worldName) ||
      !Array.isArray(hotbar) ||
      hotbar.length !== DEFAULT_HOTBAR_ITEM_IDS.length ||
      !Array.isArray(durabilityValue) ||
      durabilityValue.length > 256 ||
      (gameMode !== 'survival' && gameMode !== 'creative')
    )
      return null;
    const hotbarIds = new Set<number>();
    for (const itemId of hotbar) {
      if (itemId === null) continue;
      if (!isSafeInt(itemId) || hotbarIds.has(itemId)) return null;
      try {
        DEFAULT_ITEMS.get(itemId);
      } catch {
        return null;
      }
      hotbarIds.add(itemId);
    }

    const inventory: SavedInventoryItem[] = [];
    const itemIds = new Set<number>();
    for (const entry of value['inventory']) {
      if (
        !isRecord(entry) ||
        !isSafeInt(entry['itemId']) ||
        !isSafeInt(entry['count']) ||
        entry['count'] < 1 ||
        entry['count'] > 9_999 ||
        itemIds.has(entry['itemId'])
      )
        return null;
      try {
        const item = DEFAULT_ITEMS.get(entry['itemId']);
        if (entry['count'] > (item.maxStack ?? 64)) return null;
      } catch {
        return null;
      }
      itemIds.add(entry['itemId']);
      inventory.push({ itemId: entry['itemId'], count: entry['count'] });
    }

    const durability: SavedDurability[] = [];
    const durabilityIds = new Set<number>();
    for (const entry of durabilityValue) {
      if (!isRecord(entry) || !isSafeInt(entry['itemId']) || !isSafeInt(entry['remaining']))
        return null;
      let item: ReturnType<typeof DEFAULT_ITEMS.get>;
      try {
        item = DEFAULT_ITEMS.get(entry['itemId']);
      } catch {
        return null;
      }
      if (
        (item.kind !== 'tool' && item.kind !== 'weapon') ||
        entry['remaining'] < 1 ||
        entry['remaining'] > (item.maxDurability ?? 0) ||
        durabilityIds.has(entry['itemId'])
      )
        return null;
      durabilityIds.add(entry['itemId']);
      durability.push({ itemId: entry['itemId'], remaining: entry['remaining'] });
    }

    const mutations: SavedBlockMutation[] = [];
    const positions = new Set<string>();
    for (const entry of value['mutations']) {
      const mutation = decodeMutation(entry);
      if (!mutation) return null;
      const key = `${mutation.x},${mutation.y},${mutation.z}`;
      if (positions.has(key)) return null;
      positions.add(key);
      mutations.push(mutation);
    }

    const player = value['player'];
    const survivalValue = value['survival'];
    let survival: SavedSurvival;
    if (survivalValue === undefined) {
      survival = createSurvivalState();
    } else if (
      isRecord(survivalValue) &&
      isSafeInt(survivalValue['health']) &&
      survivalValue['health'] <= 20 &&
      isSafeInt(survivalValue['hunger']) &&
      survivalValue['hunger'] <= 20 &&
      typeof survivalValue['activityProgress'] === 'number' &&
      Number.isFinite(survivalValue['activityProgress']) &&
      survivalValue['activityProgress'] >= 0 &&
      survivalValue['activityProgress'] < 120 &&
      typeof survivalValue['starvationProgress'] === 'number' &&
      Number.isFinite(survivalValue['starvationProgress']) &&
      survivalValue['starvationProgress'] >= 0 &&
      survivalValue['starvationProgress'] < 4 &&
      typeof survivalValue['regenerationProgress'] === 'number' &&
      Number.isFinite(survivalValue['regenerationProgress']) &&
      survivalValue['regenerationProgress'] >= 0 &&
      survivalValue['regenerationProgress'] < 15
    ) {
      survival = {
        health: survivalValue['health'],
        hunger: survivalValue['hunger'],
        activityProgress: survivalValue['activityProgress'],
        starvationProgress: survivalValue['starvationProgress'],
        regenerationProgress: survivalValue['regenerationProgress'],
      };
    } else {
      return null;
    }
    return {
      version: WORLD_SAVE_VERSION,
      worldId,
      worldName: worldName.trim(),
      seed: value['seed'],
      worldTime: value['worldTime'],
      player: {
        chunkX: player['chunkX'],
        chunkZ: player['chunkZ'],
        localX: player['localX'],
        localZ: player['localZ'],
        y: player['y'],
        yaw: player['yaw'],
        pitch: player['pitch'],
      },
      inventory,
      mutations,
      survival,
      hotbar: hotbar as (number | null)[],
      durability,
      gameMode,
    };
  } catch {
    return null;
  }
}

export function encodeWorldSave(save: WorldSave): string {
  try {
    const mutations: CompactMutation[] = save.mutations.map((mutation) => {
      const coordinate = worldToChunk(mutation.x, mutation.z);
      return [
        coordinate.chunk.x,
        coordinate.chunk.z,
        worldBlockIndex(coordinate.localX, mutation.y, coordinate.localZ),
        mutation.blockId,
      ];
    });
    const encoded = JSON.stringify({ ...save, mutations });
    if (!encoded || encoded.length > MAX_SAVE_CHARS)
      throw new WorldSaveError('too-large', 'World save exceeds the 2 MB limit.');
    if (!decodeWorldSave(encoded))
      throw new WorldSaveError('invalid', 'World save contains invalid data.');
    return encoded;
  } catch (error) {
    if (error instanceof WorldSaveError) throw error;
    throw new WorldSaveError('invalid', 'World save contains invalid data.');
  }
}

export function readWorldSave(
  storage: Pick<Storage, 'getItem'>,
  key = WORLD_SAVE_KEY,
): WorldSave | null {
  try {
    return decodeWorldSave(storage.getItem(key));
  } catch {
    return null;
  }
}

export function writeWorldSave(
  storage: Pick<Storage, 'setItem'>,
  save: WorldSave,
  key = WORLD_SAVE_KEY,
): WorldSaveWriteResult {
  let encoded: string;
  try {
    encoded = encodeWorldSave(save);
  } catch (error) {
    return { ok: false, reason: error instanceof WorldSaveError ? error.reason : 'invalid' };
  }
  try {
    storage.setItem(key, encoded);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'storage' };
  }
}
