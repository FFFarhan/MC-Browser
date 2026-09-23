import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignalingClient } from './SignalingClient';

afterEach(() => vi.useRealTimers());

class FakeSocket {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  readonly sent: Record<string, unknown>[] = [];

  send(message: string): void {
    const decoded: unknown = JSON.parse(message);
    if (typeof decoded === 'object' && decoded !== null && !Array.isArray(decoded))
      this.sent.push(decoded as Record<string, unknown>);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

describe('WebSocket signaling client', () => {
  it('creates a private room and emits only validated server events', async () => {
    const socket = new FakeSocket();
    const client = new SignalingClient(
      'wss://play.example.test/signal',
      () => socket as unknown as WebSocket,
    );
    const events: string[] = [];
    client.subscribe((event) => events.push(event.op));
    const connected = client.connect();
    socket.open();
    await connected;

    const created = client.createRoom();
    await Promise.resolve();
    expect(socket.sent.at(-1)).toEqual({ op: 'create' });
    socket.receive({
      op: 'created',
      roomCode: 'a1b2c3d4e5f6',
      peerId: '1'.repeat(24),
      expiresAt: 2_000,
    });
    await expect(created).resolves.toMatchObject({ roomCode: 'A1B2C3D4E5F6' });
    socket.receive({ op: 'created', roomCode: 'guess', peerId: 'bad', expiresAt: 2_000 });
    expect(events).toEqual(['created', 'error']);
    client.close();
  });

  it('joins with bounded capabilities, accepts, and forwards validated ICE negotiation', async () => {
    const socket = new FakeSocket();
    const client = new SignalingClient(
      'ws://localhost:8787/signal',
      () => socket as unknown as WebSocket,
    );
    const events: string[] = [];
    client.subscribe((event) => events.push(event.op));
    const connected = client.connect();
    socket.open();
    await connected;

    const waiting = client.joinRoom('a1b2c3d4e5f6', {
      protocolVersion: 1,
      dataChannel: true,
      maxPayloadBytes: 16_384,
    });
    await Promise.resolve();
    expect(socket.sent.at(-1)).toMatchObject({ op: 'join', roomCode: 'A1B2C3D4E5F6' });
    socket.receive({
      op: 'waiting',
      roomCode: 'A1B2C3D4E5F6',
      peerId: '2'.repeat(24),
      hostId: '1'.repeat(24),
      expiresAt: 2_000,
    });
    await expect(waiting).resolves.toMatchObject({ hostId: '1'.repeat(24) });
    socket.receive({ op: 'approved', roomCode: 'A1B2C3D4E5F6', peerId: '2'.repeat(24) });
    client.sendSignal('1'.repeat(24), {
      kind: 'ice',
      candidate: { candidate: 'candidate:1 1 udp 1 127.0.0.1 9000 typ host', sdpMid: '0' },
    });
    expect(socket.sent.at(-1)).toMatchObject({ op: 'signal', to: '1'.repeat(24) });
    expect(events).toEqual(['waiting', 'approved']);
    await expect(
      client.joinRoom('invalid', {
        protocolVersion: 1,
        dataChannel: true,
        maxPayloadBytes: 16_384,
      }),
    ).rejects.toThrow('Invite code is invalid');
    client.close();
  });

  it('rejects a pending join immediately when the server declines the invite', async () => {
    const socket = new FakeSocket();
    const client = new SignalingClient(
      'ws://localhost:8787/signal',
      () => socket as unknown as WebSocket,
    );
    const connected = client.connect();
    socket.open();
    await connected;
    const waiting = client.joinRoom('a1b2c3d4e5f6', {
      protocolVersion: 1,
      dataChannel: true,
      maxPayloadBytes: 16_384,
    });
    await Promise.resolve();
    socket.receive({ op: 'rejected', reason: 'No active room has that invite code' });
    await expect(waiting).rejects.toThrow('No active room');
    client.close();
  });

  it('sends periodic keepalives over an idle room connection and parses the response', async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const client = new SignalingClient(
      'wss://play.example.test/signal',
      () => socket as unknown as WebSocket,
      8_000,
      5_000,
    );
    const events: string[] = [];
    client.subscribe((event) => events.push(event.op));
    const connected = client.connect();
    socket.open();
    await connected;

    await vi.advanceTimersByTimeAsync(5_000);
    expect(socket.sent).toContainEqual({ op: 'keepalive' });
    socket.receive({ op: 'alive' });
    expect(events).toEqual(['alive']);

    client.close();
    const sentCount = socket.sent.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(socket.sent).toHaveLength(sentCount);
  });
});
