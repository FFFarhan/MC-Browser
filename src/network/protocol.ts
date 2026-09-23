import { WORLD_HEIGHT } from '../shared/coordinates';

export const NETWORK_PROTOCOL_VERSION = 1 as const;
export const MAX_NETWORK_MESSAGE_BYTES = 16 * 1024;
export const MAX_WORLD_ID_LENGTH = 64;
export const MAX_PEER_ID_LENGTH = 64;
export const MAX_NETWORK_STRING_LENGTH = 160;
export const MAX_SEED_LENGTH = 80;
export const MAX_WORLD_COORDINATE = 1_000_000;
export const MAX_BLOCK_ID = 65_535;
export const MAX_SNAPSHOT_MUTATIONS = 256;
export const MAX_DELTA_MUTATIONS = 128;
export const MAX_NETWORK_INVENTORY_ITEMS = 128;
export const MAX_PROTOCOL_COUNTER = Number.MAX_SAFE_INTEGER;

export interface NetworkPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly pitch: number;
}

export interface NetworkBlockPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface NetworkBlockMutation {
  readonly position: NetworkBlockPosition;
  readonly blockId: number;
}

export interface NetworkInventoryItem {
  readonly itemId: number;
  readonly count: number;
}

interface NetworkMessageBase {
  readonly protocolVersion: typeof NETWORK_PROTOCOL_VERSION;
  readonly worldId: string;
}

export interface HelloMessage extends NetworkMessageBase {
  readonly type: 'hello';
  readonly generatorVersion: number;
  readonly contentVersion: number;
}

export interface AcceptMessage extends NetworkMessageBase {
  readonly type: 'accept';
  readonly accepted: boolean;
  readonly reason?: string;
}

export interface SnapshotMessage extends NetworkMessageBase {
  readonly type: 'snapshot';
  readonly seed: number | string;
  readonly worldTime: number;
  readonly revision: number;
  readonly hostPose: NetworkPose;
  readonly mutations: readonly NetworkBlockMutation[];
  readonly inventory?: readonly NetworkInventoryItem[];
}

export type NetworkActionRequest =
  | {
      readonly type: 'break';
      readonly position: NetworkBlockPosition;
      readonly heldItemId?: number;
    }
  | {
      readonly type: 'place';
      readonly position: NetworkBlockPosition;
      readonly blockId: number;
    }
  | { readonly type: 'attack' };

export interface InputMessage extends NetworkMessageBase {
  readonly type: 'input';
  readonly sequence: number;
  readonly pose: NetworkPose;
  readonly action?: NetworkActionRequest;
}

export interface PlayerStateMessage extends NetworkMessageBase {
  readonly type: 'player-state';
  readonly peerId: string;
  readonly sequence: number;
  readonly pose: NetworkPose;
}

export interface WorldDeltaMessage extends NetworkMessageBase {
  readonly type: 'world-delta';
  readonly revision: number;
  readonly mutations: readonly NetworkBlockMutation[];
  readonly inventory?: readonly NetworkInventoryItem[];
}

export interface LeaveMessage extends NetworkMessageBase {
  readonly type: 'leave';
}

export interface ErrorMessage extends NetworkMessageBase {
  readonly type: 'error';
  readonly code: string;
  readonly message: string;
}

export type NetworkMessage =
  | HelloMessage
  | AcceptMessage
  | SnapshotMessage
  | InputMessage
  | PlayerStateMessage
  | WorldDeltaMessage
  | LeaveMessage
  | ErrorMessage;

export type NetworkMessageParseError =
  'invalid-json' | 'too-large' | 'invalid-message' | 'unsupported-version' | 'wrong-world';

export type NetworkMessageParseResult =
  | { readonly ok: true; readonly message: NetworkMessage }
  | { readonly ok: false; readonly error: NetworkMessageParseError };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: UnknownRecord,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  if (required.some((key) => !Object.hasOwn(value, key))) return false;
  return keys.every((key) => required.includes(key) || optional.includes(key));
}

function isSafeCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 0;
}

function isVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 1 && value <= 65_535;
}

function isWorldId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_WORLD_ID_LENGTH &&
    /^[a-z0-9][a-z0-9-]*$/.test(value)
  );
}

function isPeerId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_PEER_ID_LENGTH &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

function isBoundedText(value: unknown, maxLength = MAX_NETWORK_STRING_LENGTH): value is string {
  if (typeof value !== 'string' || value.length > maxLength) return false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) return false;
  }
  return true;
}

function isSeed(value: unknown): value is number | string {
  if (typeof value === 'string') return value.trim().length > 0 && value.length <= MAX_SEED_LENGTH;
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= -Number.MAX_SAFE_INTEGER &&
    value <= Number.MAX_SAFE_INTEGER
  );
}

function isWorldXz(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_WORLD_COORDINATE
  );
}

function isPose(value: unknown): value is NetworkPose {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['x', 'y', 'z', 'yaw', 'pitch']) ||
    !isWorldXz(value['x']) ||
    !isWorldXz(value['z']) ||
    typeof value['y'] !== 'number' ||
    !Number.isFinite(value['y']) ||
    value['y'] < 0 ||
    value['y'] >= WORLD_HEIGHT ||
    typeof value['yaw'] !== 'number' ||
    !Number.isFinite(value['yaw']) ||
    Math.abs(value['yaw']) > Math.PI * 4 ||
    typeof value['pitch'] !== 'number' ||
    !Number.isFinite(value['pitch']) ||
    Math.abs(value['pitch']) >= Math.PI / 2
  )
    return false;
  return true;
}

function isBlockPosition(value: unknown): value is NetworkBlockPosition {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['x', 'y', 'z']) &&
    Number.isSafeInteger(value['x']) &&
    typeof value['x'] === 'number' &&
    Math.abs(value['x']) <= MAX_WORLD_COORDINATE &&
    Number.isSafeInteger(value['z']) &&
    typeof value['z'] === 'number' &&
    Math.abs(value['z']) <= MAX_WORLD_COORDINATE &&
    Number.isSafeInteger(value['y']) &&
    typeof value['y'] === 'number' &&
    value['y'] >= 0 &&
    value['y'] < WORLD_HEIGHT
  );
}

function isBlockId(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_BLOCK_ID
  );
}

function isMutation(value: unknown): value is NetworkBlockMutation {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['position', 'blockId']) &&
    isBlockPosition(value['position']) &&
    isBlockId(value['blockId'])
  );
}

function areMutations(value: unknown, maxLength: number): value is NetworkBlockMutation[] {
  if (!Array.isArray(value) || value.length > maxLength) return false;
  const positions = new Set<string>();
  for (const mutation of value) {
    if (!isMutation(mutation)) return false;
    const { x, y, z } = mutation.position;
    const key = `${x},${y},${z}`;
    if (positions.has(key)) return false;
    positions.add(key);
  }
  return true;
}

function isInventoryItem(value: unknown): value is NetworkInventoryItem {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['itemId', 'count']) &&
    isBlockId(value['itemId']) &&
    Number.isSafeInteger(value['count']) &&
    typeof value['count'] === 'number' &&
    value['count'] >= 1 &&
    value['count'] <= 9_999
  );
}

function isInventory(value: unknown): value is NetworkInventoryItem[] {
  if (!Array.isArray(value) || value.length > MAX_NETWORK_INVENTORY_ITEMS) return false;
  const itemIds = new Set<number>();
  for (const item of value) {
    if (!isInventoryItem(item) || itemIds.has(item.itemId)) return false;
    itemIds.add(item.itemId);
  }
  return true;
}

function isAction(value: unknown): value is NetworkActionRequest {
  if (!isRecord(value) || typeof value['type'] !== 'string') return false;
  if (value['type'] === 'attack') return hasExactKeys(value, ['type']);
  if (value['type'] === 'break') {
    return (
      hasExactKeys(value, ['type', 'position'], ['heldItemId']) &&
      isBlockPosition(value['position']) &&
      (!Object.hasOwn(value, 'heldItemId') || isBlockId(value['heldItemId']))
    );
  }
  if (value['type'] === 'place') {
    return (
      hasExactKeys(value, ['type', 'position', 'blockId']) &&
      isBlockPosition(value['position']) &&
      isBlockId(value['blockId'])
    );
  }
  return false;
}

function isCommonMessage(value: UnknownRecord): boolean {
  return value['protocolVersion'] === NETWORK_PROTOCOL_VERSION && isWorldId(value['worldId']);
}

function isNetworkMessage(value: unknown): value is NetworkMessage {
  if (!isRecord(value) || !isCommonMessage(value) || typeof value['type'] !== 'string')
    return false;
  switch (value['type']) {
    case 'hello':
      return (
        hasExactKeys(value, [
          'protocolVersion',
          'worldId',
          'type',
          'generatorVersion',
          'contentVersion',
        ]) &&
        isVersion(value['generatorVersion']) &&
        isVersion(value['contentVersion'])
      );
    case 'accept':
      return (
        hasExactKeys(value, ['protocolVersion', 'worldId', 'type', 'accepted'], ['reason']) &&
        typeof value['accepted'] === 'boolean' &&
        (!Object.hasOwn(value, 'reason') || isBoundedText(value['reason']))
      );
    case 'snapshot':
      return (
        hasExactKeys(
          value,
          [
            'protocolVersion',
            'worldId',
            'type',
            'seed',
            'worldTime',
            'revision',
            'hostPose',
            'mutations',
          ],
          ['inventory'],
        ) &&
        isSeed(value['seed']) &&
        typeof value['worldTime'] === 'number' &&
        Number.isFinite(value['worldTime']) &&
        value['worldTime'] >= 0 &&
        value['worldTime'] < 1_200 &&
        isSafeCounter(value['revision']) &&
        isPose(value['hostPose']) &&
        areMutations(value['mutations'], MAX_SNAPSHOT_MUTATIONS) &&
        (!Object.hasOwn(value, 'inventory') || isInventory(value['inventory']))
      );
    case 'input':
      return (
        hasExactKeys(
          value,
          ['protocolVersion', 'worldId', 'type', 'sequence', 'pose'],
          ['action'],
        ) &&
        isSafeCounter(value['sequence']) &&
        isPose(value['pose']) &&
        (!Object.hasOwn(value, 'action') || isAction(value['action']))
      );
    case 'player-state':
      return (
        hasExactKeys(value, ['protocolVersion', 'worldId', 'type', 'peerId', 'sequence', 'pose']) &&
        isPeerId(value['peerId']) &&
        isSafeCounter(value['sequence']) &&
        isPose(value['pose'])
      );
    case 'world-delta':
      return (
        hasExactKeys(
          value,
          ['protocolVersion', 'worldId', 'type', 'revision', 'mutations'],
          ['inventory'],
        ) &&
        isSafeCounter(value['revision']) &&
        areMutations(value['mutations'], MAX_DELTA_MUTATIONS) &&
        (!Object.hasOwn(value, 'inventory') || isInventory(value['inventory']))
      );
    case 'leave':
      return hasExactKeys(value, ['protocolVersion', 'worldId', 'type']);
    case 'error':
      return (
        hasExactKeys(value, ['protocolVersion', 'worldId', 'type', 'code', 'message']) &&
        typeof value['code'] === 'string' &&
        /^[a-z0-9-]{1,48}$/.test(value['code']) &&
        isBoundedText(value['message'])
      );
    default:
      return false;
  }
}

export function parseNetworkMessage(
  raw: string,
  expectedWorldId?: string,
): NetworkMessageParseResult {
  if (new TextEncoder().encode(raw).byteLength > MAX_NETWORK_MESSAGE_BYTES)
    return { ok: false, error: 'too-large' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'invalid-json' };
  }

  if (
    isRecord(parsed) &&
    Object.hasOwn(parsed, 'protocolVersion') &&
    parsed['protocolVersion'] !== NETWORK_PROTOCOL_VERSION
  )
    return { ok: false, error: 'unsupported-version' };
  if (!isNetworkMessage(parsed)) return { ok: false, error: 'invalid-message' };
  if (expectedWorldId !== undefined && parsed.worldId !== expectedWorldId)
    return { ok: false, error: 'wrong-world' };
  return { ok: true, message: parsed };
}
