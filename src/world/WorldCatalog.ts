import {
  decodeWorldSave,
  readWorldSave,
  WORLD_SAVE_KEY,
  WORLD_SAVE_PREFIX,
  writeWorldSave,
  type WorldSave,
  type WorldSaveWriteResult,
} from './WorldSave';

export const WORLD_CATALOG_KEY = 'stonefield.worlds.v1';
export const LEGACY_WORLD_ID = 'world-legacy';
export const DEFAULT_WORLD_ID = 'world-default';
export const DEFAULT_WORLD_NAME = 'Quiet Valley';
export const DEFAULT_WORLD_SEED = 'quiet-valley';
const WORLD_CATALOG_VERSION = 1;
const MAX_WORLDS = 64;

export interface WorldSummary {
  readonly id: string;
  readonly name: string;
  readonly seed: number | string;
}

export interface NewWorldInput {
  readonly name: string;
  readonly seed?: number | string;
}

export type WorldStorage = Pick<Storage, 'getItem' | 'setItem'>;

export class WorldCatalogError extends Error {
  constructor(
    readonly reason: 'invalid' | 'storage' | 'limit' | 'duplicate' | 'missing',
    message: string,
  ) {
    super(message);
    this.name = 'WorldCatalogError';
  }
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
}

function normalizeName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (name.length === 0 || name.length > 32) return null;
  for (const character of name) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) return null;
  }
  return name;
}

function validSeed(value: unknown): value is number | string {
  return (
    (typeof value === 'string' && value.trim().length > 0 && value.length <= 80) ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeCatalog(raw: string): WorldSummary[] | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value['version'] !== WORLD_CATALOG_VERSION ||
      !Array.isArray(value['worlds']) ||
      value['worlds'].length === 0 ||
      value['worlds'].length > MAX_WORLDS
    )
      return null;
    const ids = new Set<string>();
    const worlds: WorldSummary[] = [];
    for (const entry of value['worlds']) {
      if (!isRecord(entry)) return null;
      const name = normalizeName(entry['name']);
      if (!validId(entry['id']) || !name || !validSeed(entry['seed']) || ids.has(entry['id']))
        return null;
      ids.add(entry['id']);
      worlds.push(Object.freeze({ id: entry['id'], name, seed: entry['seed'] }));
    }
    return worlds;
  } catch {
    return null;
  }
}

function saveCatalog(storage: WorldStorage, worlds: readonly WorldSummary[]): void {
  try {
    storage.setItem(WORLD_CATALOG_KEY, JSON.stringify({ version: WORLD_CATALOG_VERSION, worlds }));
  } catch {
    throw new WorldCatalogError('storage', 'Browser storage is full or unavailable.');
  }
}

function readCatalog(storage: WorldStorage): WorldSummary[] {
  let raw: string | null;
  try {
    raw = storage.getItem(WORLD_CATALOG_KEY);
  } catch {
    throw new WorldCatalogError('storage', 'Browser storage is unavailable.');
  }
  if (raw !== null) {
    const decoded = decodeCatalog(raw);
    if (!decoded) throw new WorldCatalogError('invalid', 'The saved world list is malformed.');
    return decoded;
  }

  let legacy: ReturnType<typeof decodeWorldSave>;
  try {
    legacy = decodeWorldSave(storage.getItem(WORLD_SAVE_KEY));
  } catch {
    throw new WorldCatalogError('storage', 'Browser storage is unavailable.');
  }
  const initial: WorldSummary[] = legacy
    ? [{ id: LEGACY_WORLD_ID, name: legacy.worldName, seed: legacy.seed }]
    : [{ id: DEFAULT_WORLD_ID, name: DEFAULT_WORLD_NAME, seed: DEFAULT_WORLD_SEED }];
  saveCatalog(storage, initial);
  return initial;
}

export function listWorlds(storage: WorldStorage): readonly WorldSummary[] {
  return readCatalog(storage).map((world) => Object.freeze({ ...world }));
}

export function createWorld(
  storage: WorldStorage,
  input: NewWorldInput,
  idFactory: () => string = createWorldId,
): WorldSummary {
  const name = normalizeName(input.name);
  if (!name || (input.seed !== undefined && !validSeed(input.seed)))
    throw new WorldCatalogError(
      'invalid',
      'Enter a world name up to 32 characters and a valid seed.',
    );
  const worlds = readCatalog(storage);
  if (worlds.length >= MAX_WORLDS)
    throw new WorldCatalogError('limit', `You can create up to ${MAX_WORLDS} worlds.`);
  const id = idFactory();
  if (!validId(id)) throw new WorldCatalogError('invalid', 'The generated world ID is invalid.');
  if (worlds.some((world) => world.id === id))
    throw new WorldCatalogError('duplicate', 'A world with that ID already exists.');
  const seed = input.seed ?? Math.floor(Math.random() * 4_294_967_296);
  const created = Object.freeze({ id, name, seed });
  saveCatalog(storage, [...worlds, created]);
  return created;
}

export function loadWorld(storage: WorldStorage, worldId: string): WorldSave | null {
  const summary = readCatalog(storage).find((world) => world.id === worldId);
  if (!summary) throw new WorldCatalogError('missing', 'That world no longer exists.');
  const key = worldStorageKey(worldId);
  const save = readWorldSave(storage, key);
  if (save) {
    if (save.worldId !== worldId || save.worldName !== summary.name || save.seed !== summary.seed)
      return null;
    return save;
  }
  if (worldId === LEGACY_WORLD_ID) {
    const legacy = readWorldSave(storage, WORLD_SAVE_KEY);
    return legacy ? { ...legacy, worldId, worldName: summary.name, seed: summary.seed } : null;
  }
  return null;
}

export function saveWorld(
  storage: WorldStorage,
  worldId: string,
  save: WorldSave,
): WorldSaveWriteResult {
  let summary: WorldSummary | undefined;
  try {
    summary = readCatalog(storage).find((world) => world.id === worldId);
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof WorldCatalogError && error.reason === 'storage' ? 'storage' : 'invalid',
    };
  }
  if (!summary || save.seed !== summary.seed) return { ok: false, reason: 'invalid' };
  const normalized = { ...save, version: 3 as const, worldId, worldName: summary.name };
  return writeWorldSave(storage, normalized, worldStorageKey(worldId));
}

export function worldStorageKey(worldId: string): string {
  if (!validId(worldId)) throw new WorldCatalogError('invalid', 'The world ID is invalid.');
  return `${WORLD_SAVE_PREFIX}${worldId}`;
}

function createWorldId(): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  return randomId
    ? `world-${randomId}`
    : `world-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
