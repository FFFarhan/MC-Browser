import { describe, expect, it } from 'vitest';
import { MAX_NETWORK_MESSAGE_BYTES, parseNetworkMessage } from './protocol';
import type { NetworkMessage } from './protocol';

const pose = { x: 12.5, y: 74, z: -8.25, yaw: -1.2, pitch: 0.3 };
const blockPosition = { x: 12, y: 73, z: -8 };

const validMessages: readonly NetworkMessage[] = [
  {
    protocolVersion: 1,
    worldId: 'quiet-valley',
    type: 'hello',
    generatorVersion: 1,
    contentVersion: 1,
  },
  { protocolVersion: 1, worldId: 'quiet-valley', type: 'accept', accepted: true },
  {
    protocolVersion: 1,
    worldId: 'quiet-valley',
    type: 'accept',
    accepted: false,
    reason: 'The host declined the request.',
  },
  {
    protocolVersion: 1,
    worldId: 'quiet-valley',
    type: 'snapshot',
    seed: 'quiet-valley-seed',
    worldTime: 812.5,
    revision: 4,
    hostPose: pose,
    mutations: [{ position: blockPosition, blockId: 7 }],
  },
  {
    protocolVersion: 1,
    worldId: 'quiet-valley',
    type: 'input',
    sequence: 8,
    pose,
  },
  {
    protocolVersion: 1,
    worldId: 'quiet-valley',
    type: 'input',
    sequence: 9,
    pose,
    action: { type: 'break', position: blockPosition, heldItemId: 1002 },
  },
  {
    protocolVersion: 1,
    worldId: 'quiet-valley',
    type: 'input',
    sequence: 10,
    pose,
    action: { type: 'place', position: blockPosition, blockId: 3 },
  },
  {
    protocolVersion: 1,
    worldId: 'quiet-valley',
    type: 'input',
    sequence: 11,
    pose,
    action: { type: 'attack' },
  },
  {
    protocolVersion: 1,
    worldId: 'quiet-valley',
    type: 'player-state',
    peerId: 'guest_2',
    sequence: 11,
    pose,
  },
  {
    protocolVersion: 1,
    worldId: 'quiet-valley',
    type: 'world-delta',
    revision: 5,
    mutations: [{ position: blockPosition, blockId: 0 }],
  },
  { protocolVersion: 1, worldId: 'quiet-valley', type: 'leave' },
  {
    protocolVersion: 1,
    worldId: 'quiet-valley',
    type: 'error',
    code: 'world-mismatch',
    message: 'The invitation is for another world.',
  },
];

function encode(message: unknown): string {
  return JSON.stringify(message);
}

function replaceMessage(message: NetworkMessage, replacement: Record<string, unknown>): string {
  return encode({ ...message, ...replacement });
}

describe('network data-channel protocol', () => {
  it('round-trips every supported version-one message shape', () => {
    for (const message of validMessages) {
      expect(parseNetworkMessage(encode(message), 'quiet-valley')).toEqual({ ok: true, message });
    }
  });

  it('rejects unsupported protocol versions separately from malformed messages', () => {
    const result = parseNetworkMessage(replaceMessage(validMessages[0]!, { protocolVersion: 2 }));
    expect(result).toEqual({ ok: false, error: 'unsupported-version' });
  });

  it('rejects unknown message types', () => {
    expect(parseNetworkMessage(replaceMessage(validMessages[0]!, { type: 'teleport' }))).toEqual({
      ok: false,
      error: 'invalid-message',
    });
  });

  it('rejects malformed JSON', () => {
    expect(parseNetworkMessage('{"protocolVersion":1,')).toEqual({
      ok: false,
      error: 'invalid-json',
    });
  });

  it('bounds UTF-8 payload bytes instead of JavaScript character count', () => {
    const message = {
      protocolVersion: 1,
      worldId: 'quiet-valley',
      type: 'error',
      code: 'notice',
      message: '🌿'.repeat(5_000),
    };
    const raw = encode(message);
    expect(new TextEncoder().encode(raw).byteLength).toBeGreaterThan(MAX_NETWORK_MESSAGE_BYTES);
    expect(parseNetworkMessage(raw)).toEqual({ ok: false, error: 'too-large' });
  });

  it('rejects a message addressed to a different world', () => {
    expect(parseNetworkMessage(encode(validMessages[0]), 'other-world')).toEqual({
      ok: false,
      error: 'wrong-world',
    });
  });

  it('rejects a break request with an invalid held item ID', () => {
    const base = validMessages[5]!;
    expect(
      parseNetworkMessage(
        replaceMessage(base, {
          action: { type: 'break', position: blockPosition, heldItemId: -1 },
        }),
      ),
    ).toEqual({ ok: false, error: 'invalid-message' });
  });

  it('rejects non-finite and out-of-range pose coordinates', () => {
    const base = validMessages[4]!;
    const infiniteCoordinate = encode(base).replace('"x":12.5', '"x":1e400');
    expect(parseNetworkMessage(infiniteCoordinate)).toEqual({
      ok: false,
      error: 'invalid-message',
    });
    expect(parseNetworkMessage(replaceMessage(base, { pose: { ...pose, z: 1_000_001 } }))).toEqual({
      ok: false,
      error: 'invalid-message',
    });
    expect(parseNetworkMessage(replaceMessage(base, { pose: { ...pose, pitch: 2 } }))).toEqual({
      ok: false,
      error: 'invalid-message',
    });
  });

  it('rejects invalid seeds, world time, and mutation revisions', () => {
    const base = validMessages[3]!;
    expect(parseNetworkMessage(replaceMessage(base, { seed: ' ' }))).toEqual({
      ok: false,
      error: 'invalid-message',
    });
    expect(parseNetworkMessage(replaceMessage(base, { seed: 4.5 }))).toEqual({
      ok: false,
      error: 'invalid-message',
    });
    expect(parseNetworkMessage(replaceMessage(base, { seed: 's'.repeat(81) }))).toEqual({
      ok: false,
      error: 'invalid-message',
    });
    expect(parseNetworkMessage(replaceMessage(base, { worldTime: 1_200 }))).toEqual({
      ok: false,
      error: 'invalid-message',
    });
    expect(parseNetworkMessage(replaceMessage(base, { revision: -1 }))).toEqual({
      ok: false,
      error: 'invalid-message',
    });
  });

  it('rejects snapshots with too many mutations or invalid block coordinates', () => {
    const base = validMessages[3]!;
    expect(
      parseNetworkMessage(
        replaceMessage(base, {
          mutations: Array.from({ length: 257 }, () => ({
            position: blockPosition,
            blockId: 1,
          })),
        }),
      ),
    ).toEqual({ ok: false, error: 'invalid-message' });
    expect(
      parseNetworkMessage(
        replaceMessage(base, {
          mutations: [{ position: { x: 0, y: 192, z: 0 }, blockId: 1 }],
        }),
      ),
    ).toEqual({ ok: false, error: 'invalid-message' });
    expect(
      parseNetworkMessage(
        replaceMessage(base, {
          mutations: [{ position: { x: 1_000_001, y: 4, z: 0 }, blockId: 1 }],
        }),
      ),
    ).toEqual({ ok: false, error: 'invalid-message' });
  });

  it('accepts optional authoritative inventory on snapshots and world deltas', () => {
    const inventory = [
      { itemId: 0, count: 1 },
      { itemId: 65_535, count: 9_999 },
    ];
    const snapshot = replaceMessage(validMessages[3]!, { inventory });
    const delta = replaceMessage(validMessages[9]!, { inventory });

    expect(parseNetworkMessage(snapshot, 'quiet-valley')).toEqual({
      ok: true,
      message: JSON.parse(snapshot) as unknown,
    });
    expect(parseNetworkMessage(delta, 'quiet-valley')).toEqual({
      ok: true,
      message: JSON.parse(delta) as unknown,
    });

    const maximumInventory = Array.from({ length: 128 }, (_unused, itemId) => ({
      itemId,
      count: 1,
    }));
    expect(
      parseNetworkMessage(replaceMessage(validMessages[3]!, { inventory: maximumInventory })),
    ).toMatchObject({ ok: true, message: { inventory: maximumInventory } });
  });

  it('rejects duplicate, out-of-range, or excessive authoritative inventory entries', () => {
    const snapshot = validMessages[3]!;
    const delta = validMessages[9]!;
    const invalidInventories = [
      [
        { itemId: 2, count: 1 },
        { itemId: 2, count: 2 },
      ],
      [{ itemId: -1, count: 1 }],
      [{ itemId: 65_536, count: 1 }],
      [{ itemId: 1, count: 0 }],
      [{ itemId: 1, count: 10_000 }],
      Array.from({ length: 129 }, (_unused, itemId) => ({ itemId, count: 1 })),
    ];

    for (const base of [snapshot, delta]) {
      for (const inventory of invalidInventories) {
        expect(parseNetworkMessage(replaceMessage(base, { inventory }))).toEqual({
          ok: false,
          error: 'invalid-message',
        });
      }
    }
  });

  it('rejects unknown, incomplete, or out-of-range input actions', () => {
    const base = validMessages[4]!;
    expect(
      parseNetworkMessage(
        replaceMessage(base, { action: { type: 'mine', position: blockPosition } }),
      ),
    ).toEqual({ ok: false, error: 'invalid-message' });
    expect(
      parseNetworkMessage(
        replaceMessage(base, { action: { type: 'place', position: blockPosition } }),
      ),
    ).toEqual({ ok: false, error: 'invalid-message' });
    expect(
      parseNetworkMessage(
        replaceMessage(base, {
          action: { type: 'place', position: blockPosition, blockId: 65_536 },
        }),
      ),
    ).toEqual({ ok: false, error: 'invalid-message' });
    expect(
      parseNetworkMessage(
        replaceMessage(base, { action: { type: 'break', position: blockPosition, blockId: 1 } }),
      ),
    ).toEqual({ ok: false, error: 'invalid-message' });
  });

  it('rejects unexpected properties instead of accepting unversioned extensions', () => {
    expect(parseNetworkMessage(replaceMessage(validMessages[0]!, { admin: true }))).toEqual({
      ok: false,
      error: 'invalid-message',
    });
  });
});
