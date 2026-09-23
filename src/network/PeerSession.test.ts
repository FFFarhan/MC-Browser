import { describe, expect, it, vi } from 'vitest';
import { PeerSession, type PeerSessionEvent } from './PeerSession';
import { NETWORK_PROTOCOL_VERSION, type NetworkMessage } from './protocol';
import type { SignalingClient, SignalingEvent } from './SignalingClient';

const ROOM = 'A1B2C3D4E5F6';
const HOST_ID = '1'.repeat(24);
const GUEST_ID = '2'.repeat(24);

class FakeSignalingClient {
  readonly listeners = new Set<(event: SignalingEvent) => void>();
  readonly approvals: { peerId: string; approved: boolean }[] = [];
  readonly signals: { peerId: string; data: unknown }[] = [];
  leaveCalls = 0;
  closeCalls = 0;

  async createRoom(): Promise<Extract<SignalingEvent, { op: 'created' }>> {
    const event = {
      op: 'created',
      roomCode: ROOM,
      peerId: HOST_ID,
      expiresAt: Date.now() + 60_000,
    } as const;
    this.emit(event);
    return event;
  }

  async joinRoom(roomCode: string): Promise<Extract<SignalingEvent, { op: 'waiting' }>> {
    const event = {
      op: 'waiting',
      roomCode: roomCode.toUpperCase(),
      peerId: GUEST_ID,
      hostId: HOST_ID,
      expiresAt: Date.now() + 60_000,
    } as const;
    this.emit(event);
    return event;
  }

  subscribe(listener: (event: SignalingEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  approvePeer(peerId: string, approved: boolean): void {
    this.approvals.push({ peerId, approved });
  }

  sendSignal(peerId: string, data: unknown): void {
    this.signals.push({ peerId, data });
  }

  leave(): void {
    this.leaveCalls += 1;
  }

  close(): void {
    this.closeCalls += 1;
    this.listeners.clear();
  }

  emit(event: SignalingEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

class FakeDataChannel {
  readyState: RTCDataChannelState = 'connecting';
  bufferedAmount = 0;
  binaryType: BinaryType = 'arraybuffer';
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  readonly sent: string[] = [];
  closeCalls = 0;

  constructor(
    readonly label: string,
    readonly options?: RTCDataChannelInit,
  ) {}

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closeCalls += 1;
    this.readyState = 'closed';
    this.onclose?.(new Event('close'));
  }

  open(): void {
    this.readyState = 'open';
    this.onopen?.(new Event('open'));
  }

  receive(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

class FakePeerConnection {
  connectionState: RTCPeerConnectionState = 'new';
  localDescription: RTCSessionDescription | null = null;
  remoteDescription: RTCSessionDescription | null = null;
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  ondatachannel: ((event: RTCDataChannelEvent) => void) | null = null;
  onconnectionstatechange: ((event: Event) => void) | null = null;
  readonly channels: FakeDataChannel[] = [];
  readonly addedCandidates: RTCIceCandidateInit[] = [];
  closeCalls = 0;
  createOfferCalls = 0;
  createAnswerCalls = 0;

  constructor(readonly configuration: RTCConfiguration) {}

  createDataChannel(label: string, options?: RTCDataChannelInit): RTCDataChannel {
    const channel = new FakeDataChannel(label, options);
    this.channels.push(channel);
    return channel as unknown as RTCDataChannel;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    this.createOfferCalls += 1;
    return { type: 'offer', sdp: 'host-offer' };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    this.createAnswerCalls += 1;
    return { type: 'answer', sdp: 'guest-answer' };
  }

  async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = description as RTCSessionDescription;
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = description as RTCSessionDescription;
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    this.addedCandidates.push(candidate);
  }

  close(): void {
    this.closeCalls += 1;
    this.connectionState = 'closed';
    this.onconnectionstatechange?.(new Event('connectionstatechange'));
  }

  receiveDataChannel(channel: FakeDataChannel): void {
    const event: RTCDataChannelEvent = {
      channel: channel as unknown as RTCDataChannel,
    } as unknown as RTCDataChannelEvent;
    this.ondatachannel?.(event);
  }
}

function createHarness(fetcher?: typeof fetch, useDefaultIce = false) {
  const signal = new FakeSignalingClient();
  const connections: FakePeerConnection[] = [];
  const events: PeerSessionEvent[] = [];
  const session = new PeerSession({
    signalingUrl: 'wss://game.example.test/signal',
    onEvent: (event) => events.push(event),
    ...(useDefaultIce ? {} : { iceServers: [] }),
    signalingClientFactory: () => signal as unknown as SignalingClient,
    peerConnectionFactory: (configuration) => {
      const connection = new FakePeerConnection(configuration);
      connections.push(connection);
      return connection as unknown as RTCPeerConnection;
    },
    ...(fetcher ? { fetch: fetcher } : {}),
  });
  return { session, signal, connections, events };
}

function message(type: NetworkMessage['type'], worldId = ROOM.toLowerCase()): NetworkMessage {
  const base = { protocolVersion: NETWORK_PROTOCOL_VERSION, worldId } as const;
  switch (type) {
    case 'hello':
      return { ...base, type, generatorVersion: 1, contentVersion: 1 };
    case 'input':
      return { ...base, type, sequence: 1, pose: { x: 0, y: 10, z: 0, yaw: 0, pitch: 0 } };
    case 'leave':
      return { ...base, type };
    case 'accept':
      return { ...base, type, accepted: true };
    case 'snapshot':
      return {
        ...base,
        type,
        seed: 1,
        worldTime: 0,
        revision: 0,
        hostPose: { x: 0, y: 10, z: 0, yaw: 0, pitch: 0 },
        mutations: [],
      };
    case 'player-state':
      return {
        ...base,
        type,
        peerId: GUEST_ID,
        sequence: 1,
        pose: { x: 1, y: 10, z: 1, yaw: 0, pitch: 0 },
      };
    case 'world-delta':
      return { ...base, type, revision: 1, mutations: [] };
    case 'error':
      return { ...base, type, code: 'test', message: 'test error' };
  }
}

async function createHostPeer(
  harness: ReturnType<typeof createHarness>,
): Promise<FakePeerConnection> {
  await harness.session.host();
  harness.signal.emit({ op: 'join-request', peerId: GUEST_ID, capabilities: {} });
  harness.session.approvePeer(GUEST_ID, true);
  harness.signal.emit({ op: 'peer-approved', peerId: GUEST_ID, capabilities: {} });
  await vi.waitFor(() => expect(harness.connections).toHaveLength(1));
  return harness.connections[0]!;
}

describe('PeerSession', () => {
  it('creates a host room and negotiates ordered reliable and bounded presence channels', async () => {
    const harness = createHarness();
    await expect(harness.session.host()).resolves.toBe(ROOM);
    harness.signal.emit({ op: 'join-request', peerId: GUEST_ID, capabilities: {} });
    harness.session.approvePeer(GUEST_ID, true);
    harness.signal.emit({ op: 'peer-approved', peerId: GUEST_ID, capabilities: {} });

    await vi.waitFor(() => expect(harness.connections).toHaveLength(1));
    const connection = harness.connections[0]!;
    await vi.waitFor(() => expect(connection.createOfferCalls).toBe(1));
    expect(connection.channels.map(({ label, options }) => [label, options])).toEqual([
      ['reliable', { ordered: true }],
      ['presence', { ordered: false, maxRetransmits: 0 }],
    ]);
    expect(harness.signal.signals).toContainEqual({
      peerId: GUEST_ID,
      data: { kind: 'offer', sdp: 'host-offer' },
    });
    expect(harness.events.some((event) => event.type === 'room-created')).toBe(true);
  });

  it('buffers early ICE candidates and applies them after the remote description', async () => {
    const harness = createHarness();
    const connection = await createHostPeer(harness);
    harness.signal.emit({
      op: 'signal',
      from: GUEST_ID,
      data: { kind: 'ice', candidate: { candidate: 'candidate:1', sdpMid: '0' } },
    });
    expect(connection.addedCandidates).toHaveLength(0);
    harness.signal.emit({
      op: 'signal',
      from: GUEST_ID,
      data: { kind: 'answer', sdp: 'guest-answer' },
    });
    await vi.waitFor(() => expect(connection.addedCandidates).toHaveLength(1));
    expect(connection.addedCandidates[0]).toMatchObject({ candidate: 'candidate:1' });
  });

  it('lets only the host create offers and lets an approved guest answer the host offer', async () => {
    const harness = createHarness();
    await harness.session.join(ROOM.toLowerCase());
    harness.signal.emit({ op: 'approved', roomCode: ROOM, peerId: GUEST_ID });
    await vi.waitFor(() => expect(harness.connections).toHaveLength(1));
    const connection = harness.connections[0]!;
    harness.signal.emit({
      op: 'signal',
      from: HOST_ID,
      data: { kind: 'offer', sdp: 'host-offer' },
    });
    await vi.waitFor(() => expect(connection.createAnswerCalls).toBe(1));
    expect(connection.localDescription).toMatchObject({ type: 'answer' });
    expect(harness.signal.signals).toContainEqual({
      peerId: HOST_ID,
      data: { kind: 'answer', sdp: 'guest-answer' },
    });
    expect(connection.createOfferCalls).toBe(0);
  });

  it('buffers guest offer and ICE signaling that arrives while ICE configuration is loading', async () => {
    let releaseFetch!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((resolve) => {
          releaseFetch = resolve;
        }),
    );
    const harness = createHarness(fetcher, true);
    await harness.session.join(ROOM);
    harness.signal.emit({ op: 'approved', roomCode: ROOM, peerId: GUEST_ID });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    harness.signal.emit({
      op: 'signal',
      from: HOST_ID,
      data: { kind: 'ice', candidate: { candidate: 'candidate:early', sdpMid: '0' } },
    });
    harness.signal.emit({
      op: 'signal',
      from: HOST_ID,
      data: { kind: 'offer', sdp: 'host-offer' },
    });
    releaseFetch(new Response(JSON.stringify({ iceServers: [] }), { status: 200 }));

    await vi.waitFor(() => expect(harness.connections[0]?.addedCandidates).toHaveLength(1));
    expect(harness.connections[0]?.remoteDescription).toMatchObject({ type: 'offer' });
  });

  it('parses payloads against the room and rejects messages that violate the peer role', async () => {
    const harness = createHarness();
    const connection = await createHostPeer(harness);
    const reliable = connection.channels[0]!;
    reliable.open();
    reliable.receive(JSON.stringify(message('hello')));
    reliable.receive(JSON.stringify(message('snapshot')));
    reliable.receive(JSON.stringify(message('hello', 'another-world')));
    reliable.receive(new ArrayBuffer(8));
    expect(harness.events.filter((event) => event.type === 'message')).toMatchObject([
      { peerId: GUEST_ID, message: { type: 'hello' } },
    ]);
  });

  it('does not send presence when the unordered channel buffer is above its bound', async () => {
    const harness = createHarness();
    const connection = await createHostPeer(harness);
    const presence = connection.channels[1]!;
    presence.open();
    presence.bufferedAmount = 65_537;
    harness.session.sendPresence(GUEST_ID, message('player-state'));
    expect(presence.sent).toHaveLength(0);
    expect(harness.events.some((event) => event.type === 'error')).toBe(true);
  });

  it('tears down a failed peer once and closes all peer and signaling resources', async () => {
    const harness = createHarness();
    const connection = await createHostPeer(harness);
    const reliable = connection.channels[0]!;
    const presence = connection.channels[1]!;
    reliable.open();
    presence.open();
    harness.signal.emit({ op: 'peer-left', peerId: GUEST_ID });
    harness.signal.emit({ op: 'peer-left', peerId: GUEST_ID });
    expect(connection.closeCalls).toBe(1);
    expect(reliable.closeCalls).toBe(1);
    expect(presence.closeCalls).toBe(1);
    expect(harness.events.filter((event) => event.type === 'disconnected')).toHaveLength(1);
    harness.session.close();
    expect(harness.signal.leaveCalls).toBe(1);
    expect(harness.signal.closeCalls).toBe(1);
  });

  it('closes active peer resources and reports one disconnect when the session closes', async () => {
    const harness = createHarness();
    const connection = await createHostPeer(harness);
    const reliable = connection.channels[0]!;
    const presence = connection.channels[1]!;
    reliable.open();
    presence.open();

    harness.session.close();

    expect(connection.closeCalls).toBe(1);
    expect(reliable.closeCalls).toBe(1);
    expect(presence.closeCalls).toBe(1);
    expect(harness.events.filter((event) => event.type === 'disconnected')).toHaveLength(1);
    expect(harness.signal.leaveCalls).toBe(1);
    expect(harness.signal.closeCalls).toBe(1);
  });

  it('loads ICE configuration from the signaling endpoint and falls back when unavailable', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
    const harness = createHarness(fetcher, true);
    await harness.session.host();
    harness.signal.emit({ op: 'join-request', peerId: GUEST_ID, capabilities: {} });
    harness.session.approvePeer(GUEST_ID, true);
    harness.signal.emit({ op: 'peer-approved', peerId: GUEST_ID, capabilities: {} });
    await vi.waitFor(() => expect(harness.connections).toHaveLength(1));
    expect(fetcher).toHaveBeenCalledWith('https://game.example.test/ice', expect.any(Object));
    expect(harness.connections[0]?.configuration.iceServers).toEqual([]);
  });
});
