import {
  MAX_NETWORK_MESSAGE_BYTES,
  NETWORK_PROTOCOL_VERSION,
  parseNetworkMessage,
  type NetworkMessage,
} from './protocol';
import { SignalingClient, type PeerSignalData, type SignalingEvent } from './SignalingClient';

const MAX_GUESTS = 3;
const MAX_EARLY_ICE_CANDIDATES = 128;
const MAX_RELIABLE_BUFFER_BYTES = 1024 * 1024;
const MAX_PRESENCE_BUFFER_BYTES = 64 * 1024;
const ROOM_CODE_PATTERN = /^[0-9a-f]{12}$/i;
const PEER_ID_PATTERN = /^[0-9a-f]{24}$/i;
const SIGNAL_CAPABILITIES = {
  protocolVersion: NETWORK_PROTOCOL_VERSION,
  dataChannel: true,
  maxPayloadBytes: MAX_NETWORK_MESSAGE_BYTES,
} as const;

export type PeerSessionEvent =
  | { readonly type: 'room-created'; readonly roomCode: string; readonly peerId: string }
  | {
      readonly type: 'waiting';
      readonly roomCode: string;
      readonly peerId: string;
      readonly hostId: string;
    }
  | {
      readonly type: 'join-request';
      readonly peerId: string;
      readonly capabilities: Readonly<Record<string, unknown>>;
    }
  | { readonly type: 'peer-approved'; readonly peerId: string }
  | { readonly type: 'connected'; readonly peerId: string }
  | { readonly type: 'disconnected'; readonly peerId: string }
  | { readonly type: 'message'; readonly peerId: string; readonly message: NetworkMessage }
  | { readonly type: 'rejected'; readonly reason: string }
  | { readonly type: 'error'; readonly code: string; readonly message: string };

export interface PeerSessionOptions {
  readonly signalingUrl: string;
  readonly onEvent: (event: PeerSessionEvent) => void;
  readonly iceServers?: RTCIceServer[];
  readonly signalingClientFactory?: (url: string) => SignalingClient;
  readonly peerConnectionFactory?: (configuration: RTCConfiguration) => RTCPeerConnection;
  readonly fetch?: typeof fetch;
}

type SessionRole = 'host' | 'guest';
type SessionDataChannel = 'reliable' | 'presence';

interface PeerState {
  readonly peerId: string;
  readonly connection: RTCPeerConnection;
  readonly candidates: RTCIceCandidateInit[];
  reliable: RTCDataChannel | null;
  presence: RTCDataChannel | null;
  remoteDescriptionSet: boolean;
  reliableOpen: boolean;
  presenceOpen: boolean;
  connectedEmitted: boolean;
  closed: boolean;
}

export class PeerSession {
  private readonly options: PeerSessionOptions;
  private readonly peerConnectionFactory: (configuration: RTCConfiguration) => RTCPeerConnection;
  private readonly fetcher: typeof fetch;
  private role: SessionRole | null = null;
  private client: SignalingClient | null = null;
  private unsubscribe: (() => void) | null = null;
  private roomCode: string | null = null;
  private localPeerId: string | null = null;
  private hostPeerId: string | null = null;
  private readonly joinRequests = new Set<string>();
  private readonly approvedPeers = new Set<string>();
  private readonly negotiatingPeers = new Set<string>();
  private readonly peers = new Map<string, PeerState>();
  private readonly earlyGuestSignals: PeerSignalData[] = [];
  private iceServersPromise: Promise<RTCIceServer[]> | null = null;
  private guestApproved = false;
  private closing = false;
  private closed = false;

  constructor(options: PeerSessionOptions) {
    this.options = options;
    this.peerConnectionFactory =
      options.peerConnectionFactory ?? ((configuration) => new RTCPeerConnection(configuration));
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async host(): Promise<string> {
    this.ensureOpen();
    if (this.role) throw new Error('Peer session has already started');
    this.role = 'host';
    const client = this.ensureClient();
    try {
      const created = await client.createRoom();
      if (!ROOM_CODE_PATTERN.test(created.roomCode) || !PEER_ID_PATTERN.test(created.peerId))
        throw new Error('Signaling server returned an invalid host identity');
      this.roomCode = created.roomCode.toLowerCase();
      this.localPeerId = created.peerId;
      this.emit({ type: 'room-created', roomCode: created.roomCode, peerId: created.peerId });
      return created.roomCode;
    } catch (error) {
      this.failStart(error);
      throw error;
    }
  }

  async join(roomCode: string): Promise<void> {
    this.ensureOpen();
    if (this.role) throw new Error('Peer session has already started');
    if (!ROOM_CODE_PATTERN.test(roomCode)) throw new TypeError('Invite code is invalid');
    this.role = 'guest';
    this.roomCode = roomCode.toLowerCase();
    const client = this.ensureClient();
    try {
      const waiting = await client.joinRoom(roomCode, SIGNAL_CAPABILITIES);
      if (
        waiting.roomCode.toLowerCase() !== this.roomCode ||
        !PEER_ID_PATTERN.test(waiting.peerId) ||
        !PEER_ID_PATTERN.test(waiting.hostId) ||
        waiting.peerId === waiting.hostId
      )
        throw new Error('Signaling server returned an invalid join identity');
      this.localPeerId = waiting.peerId;
      this.hostPeerId = waiting.hostId;
      this.emit({
        type: 'waiting',
        roomCode: waiting.roomCode,
        peerId: waiting.peerId,
        hostId: waiting.hostId,
      });
    } catch (error) {
      this.failStart(error);
      throw error;
    }
  }

  approvePeer(peerId: string, approved: boolean): void {
    if (this.role !== 'host' || !this.client || !this.localPeerId) {
      this.reportError('invalid-state', 'Only a host can approve join requests.');
      return;
    }
    if (!PEER_ID_PATTERN.test(peerId) || peerId === this.localPeerId) {
      this.reportError('invalid-peer', 'Peer identifier is invalid.');
      return;
    }
    if (!this.joinRequests.has(peerId)) {
      this.reportError('unknown-peer', 'That peer has no pending join request.');
      return;
    }
    if (approved && this.peers.size + this.approvedPeers.size >= MAX_GUESTS) {
      this.reportError('room-full', 'This world already has the maximum number of guests.');
      return;
    }
    try {
      this.client.approvePeer(peerId, approved);
      this.joinRequests.delete(peerId);
      if (approved) this.approvedPeers.add(peerId);
      else this.emit({ type: 'rejected', reason: 'Join request rejected by the host.' });
    } catch (error) {
      this.reportError('approval-failed', errorMessage(error));
    }
  }

  sendReliable(peerId: string, message: NetworkMessage): void {
    this.sendToPeer(peerId, message, 'reliable');
  }

  broadcastReliable(message: NetworkMessage): void {
    for (const peerId of this.peers.keys()) this.sendReliable(peerId, message);
  }

  sendPresence(peerId: string, message: NetworkMessage): void {
    if (message.type !== 'player-state') {
      this.reportError(
        'invalid-presence',
        'Only player-state messages can use the presence channel.',
      );
      return;
    }
    this.sendToPeer(peerId, message, 'presence');
  }

  broadcastPresence(message: NetworkMessage): void {
    if (message.type !== 'player-state') {
      this.reportError(
        'invalid-presence',
        'Only player-state messages can use the presence channel.',
      );
      return;
    }
    for (const peerId of this.peers.keys()) this.sendPresence(peerId, message);
  }

  close(): void {
    if (this.closed || this.closing) return;
    this.closing = true;
    const client = this.client;
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const peer of [...this.peers.values()]) this.disposePeer(peer, true);
    this.peers.clear();
    this.joinRequests.clear();
    this.approvedPeers.clear();
    this.negotiatingPeers.clear();
    this.earlyGuestSignals.length = 0;
    this.closed = true;
    this.closing = false;
    this.client = null;
    if (client) {
      try {
        client.leave();
      } catch {
        // The socket may already have closed; local cleanup remains authoritative.
      }
      client.close();
    }
  }

  private ensureClient(): SignalingClient {
    if (this.client) return this.client;
    const client =
      this.options.signalingClientFactory?.(this.options.signalingUrl) ??
      new SignalingClient(this.options.signalingUrl);
    this.client = client;
    this.unsubscribe = client.subscribe((event) => this.onSignalingEvent(event));
    return client;
  }

  private onSignalingEvent(event: SignalingEvent): void {
    if (this.closed) return;
    switch (event.op) {
      case 'alive':
        return;
      case 'created':
        return;
      case 'waiting':
        return;
      case 'join-request':
        this.onJoinRequest(event.peerId, event.capabilities);
        return;
      case 'peer-approved':
        this.onPeerApproved(event.peerId);
        return;
      case 'approved':
        this.onApproved(event.roomCode, event.peerId);
        return;
      case 'signal':
        this.onPeerSignal(event.from, event.data);
        return;
      case 'peer-left':
        this.removePeer(event.peerId);
        this.joinRequests.delete(event.peerId);
        this.approvedPeers.delete(event.peerId);
        return;
      case 'rejected':
        this.emit({ type: 'rejected', reason: event.reason });
        return;
      case 'error':
        this.emit({ type: 'error', code: event.code, message: event.message });
        return;
      case 'closed':
        if (!this.closed)
          this.emit({ type: 'error', code: 'signaling-closed', message: event.reason });
        return;
    }
  }

  private onJoinRequest(peerId: string, capabilities: Readonly<Record<string, unknown>>): void {
    if (this.role !== 'host' || !this.localPeerId || peerId === this.localPeerId) return;
    if (!PEER_ID_PATTERN.test(peerId)) {
      this.reportError('invalid-peer', 'Signaling supplied an invalid peer identifier.');
      return;
    }
    if (this.peers.has(peerId) || this.joinRequests.has(peerId) || this.approvedPeers.has(peerId))
      return;
    if (this.peers.size + this.approvedPeers.size + this.joinRequests.size >= MAX_GUESTS) {
      try {
        this.client?.approvePeer(peerId, false);
      } catch (error) {
        this.reportError('room-full', errorMessage(error));
      }
      this.emit({
        type: 'rejected',
        reason: 'This world already has the maximum number of guests.',
      });
      return;
    }
    this.joinRequests.add(peerId);
    this.emit({ type: 'join-request', peerId, capabilities });
  }

  private onPeerApproved(peerId: string): void {
    if (
      this.role !== 'host' ||
      !this.approvedPeers.has(peerId) ||
      this.negotiatingPeers.has(peerId) ||
      this.peers.has(peerId)
    )
      return;
    if (
      !PEER_ID_PATTERN.test(peerId) ||
      this.peers.size + this.negotiatingPeers.size >= MAX_GUESTS
    ) {
      this.reportError('invalid-peer', 'Approved peer could not be added to the room.');
      return;
    }
    this.emit({ type: 'peer-approved', peerId });
    this.negotiatingPeers.add(peerId);
    void this.createHostPeer(peerId)
      .catch((error: unknown) => {
        this.reportError('negotiation-failed', errorMessage(error));
        this.removePeer(peerId);
      })
      .finally(() => {
        this.negotiatingPeers.delete(peerId);
        this.approvedPeers.delete(peerId);
      });
  }

  private onApproved(roomCode: string, peerId: string): void {
    if (
      this.role !== 'guest' ||
      this.guestApproved ||
      !this.localPeerId ||
      !this.hostPeerId ||
      !this.roomCode ||
      roomCode.toLowerCase() !== this.roomCode ||
      peerId !== this.localPeerId
    )
      return;
    this.guestApproved = true;
    this.emit({ type: 'peer-approved', peerId: this.hostPeerId });
    void this.createGuestPeer().catch((error: unknown) => {
      this.reportError('negotiation-failed', errorMessage(error));
      this.removePeer(this.hostPeerId!);
    });
  }

  private async createHostPeer(peerId: string): Promise<void> {
    const peer = await this.createPeer(peerId);
    if (peer.closed) return;
    peer.reliable = peer.connection.createDataChannel('reliable', { ordered: true });
    peer.presence = peer.connection.createDataChannel('presence', {
      ordered: false,
      maxRetransmits: 0,
    });
    this.attachDataChannel(peer, peer.reliable, 'reliable');
    this.attachDataChannel(peer, peer.presence, 'presence');
    const offer = await peer.connection.createOffer();
    if (peer.closed) return;
    await peer.connection.setLocalDescription(offer);
    const description = peer.connection.localDescription ?? offer;
    if (description.sdp) this.sendSignal(peerId, { kind: 'offer', sdp: description.sdp });
  }

  private async createGuestPeer(): Promise<void> {
    if (!this.hostPeerId) throw new Error('The host peer is not known');
    const peer = await this.createPeer(this.hostPeerId);
    for (const signal of this.earlyGuestSignals.splice(0)) this.onPeerSignal(peer.peerId, signal);
  }

  private async createPeer(peerId: string): Promise<PeerState> {
    if (this.peers.has(peerId)) return this.peers.get(peerId)!;
    const connection = this.peerConnectionFactory({ iceServers: await this.getIceServers() });
    const peer: PeerState = {
      peerId,
      connection,
      candidates: [],
      reliable: null,
      presence: null,
      remoteDescriptionSet: false,
      reliableOpen: false,
      presenceOpen: false,
      connectedEmitted: false,
      closed: false,
    };
    this.peers.set(peerId, peer);
    connection.onicecandidate = (event) => {
      if (!event.candidate || peer.closed) return;
      try {
        const candidate = event.candidate.toJSON();
        this.sendSignal(peerId, { kind: 'ice', candidate });
      } catch (error) {
        this.reportError('ice-send-failed', errorMessage(error));
      }
    };
    connection.ondatachannel = (event) => this.onRemoteDataChannel(peer, event.channel);
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'failed' || connection.connectionState === 'closed')
        this.removePeer(peerId);
    };
    return peer;
  }

  private onRemoteDataChannel(peer: PeerState, channel: RTCDataChannel): void {
    const dataChannel: SessionDataChannel | null =
      channel.label === 'reliable' ? 'reliable' : channel.label === 'presence' ? 'presence' : null;
    if (!dataChannel || peer.closed) {
      channel.close();
      return;
    }
    if (peer[dataChannel]) {
      channel.close();
      this.reportError('duplicate-channel', `Duplicate ${dataChannel} channel from peer.`);
      return;
    }
    peer[dataChannel] = channel;
    this.attachDataChannel(peer, channel, dataChannel);
  }

  private attachDataChannel(
    peer: PeerState,
    channel: RTCDataChannel,
    kind: SessionDataChannel,
  ): void {
    channel.binaryType = 'arraybuffer';
    const markOpen = (): void => {
      if (peer.closed) return;
      if (kind === 'reliable') peer.reliableOpen = true;
      else peer.presenceOpen = true;
      if (peer.reliableOpen && peer.presenceOpen && !peer.connectedEmitted) {
        peer.connectedEmitted = true;
        this.emit({ type: 'connected', peerId: peer.peerId });
      }
    };
    channel.onopen = markOpen;
    channel.onclose = () => this.removePeer(peer.peerId);
    channel.onmessage = (event: MessageEvent): void => {
      if (peer.closed) return;
      if (typeof event.data !== 'string') {
        this.reportError('invalid-data', 'Binary peer messages are not supported.');
        return;
      }
      if (new TextEncoder().encode(event.data).byteLength > MAX_NETWORK_MESSAGE_BYTES) {
        this.reportError('invalid-data', 'Peer message exceeds the size limit.');
        return;
      }
      const parsed = parseNetworkMessage(event.data, this.roomCode ?? undefined);
      if (!parsed.ok) {
        this.reportError('invalid-data', `Peer message was rejected: ${parsed.error}.`);
        return;
      }
      if (!this.canReceive(parsed.message.type)) {
        this.reportError(
          'invalid-direction',
          'Peer sent a message that is not allowed for its role.',
        );
        return;
      }
      this.emit({ type: 'message', peerId: peer.peerId, message: parsed.message });
      if (parsed.message.type === 'leave') this.removePeer(peer.peerId);
    };
    if (channel.readyState === 'open') markOpen();
  }

  private onPeerSignal(peerId: string, data: PeerSignalData): void {
    const expectedGuestSignal =
      this.role === 'guest' && this.guestApproved && peerId === this.hostPeerId;
    const isExpectedPeer = this.role === 'host' ? this.peers.has(peerId) : expectedGuestSignal;
    if (!isExpectedPeer) return;
    const peer = this.peers.get(peerId);
    if (!peer && expectedGuestSignal) {
      const candidateCount = this.earlyGuestSignals.filter(
        (signal) => signal.kind === 'ice',
      ).length;
      if (data.kind === 'ice' && candidateCount < MAX_EARLY_ICE_CANDIDATES) {
        this.earlyGuestSignals.push(data);
      } else if (
        data.kind !== 'ice' &&
        !this.earlyGuestSignals.some((signal) => signal.kind !== 'ice')
      ) {
        this.earlyGuestSignals.push(data);
      } else {
        this.reportError(
          'early-signal-overflow',
          'Too many early peer signals; excess signals were discarded.',
        );
      }
      return;
    }
    if (!peer || peer.closed) return;
    if (data.kind === 'ice') {
      if (peer.remoteDescriptionSet) {
        void peer.connection.addIceCandidate(data.candidate).catch((error: unknown) => {
          this.reportError('ice-add-failed', errorMessage(error));
        });
      } else if (peer.candidates.length < MAX_EARLY_ICE_CANDIDATES) {
        peer.candidates.push(data.candidate);
      } else {
        this.reportError(
          'ice-overflow',
          'Too many early ICE candidates; excess candidates were discarded.',
        );
      }
      return;
    }
    void this.applyRemoteDescription(peer, data).catch((error: unknown) => {
      this.reportError('negotiation-failed', errorMessage(error));
      this.removePeer(peerId);
    });
  }

  private async applyRemoteDescription(peer: PeerState, data: PeerSignalData): Promise<void> {
    if (data.kind === 'ice' || peer.closed) return;
    const expected = this.role === 'host' ? 'answer' : 'offer';
    if (data.kind !== expected || peer.remoteDescriptionSet) {
      this.reportError(
        'invalid-description',
        'Peer sent an unexpected or duplicate session description.',
      );
      return;
    }
    await peer.connection.setRemoteDescription({ type: data.kind, sdp: data.sdp });
    if (peer.closed) return;
    peer.remoteDescriptionSet = true;
    for (const candidate of peer.candidates.splice(0)) {
      try {
        await peer.connection.addIceCandidate(candidate);
      } catch (error) {
        this.reportError('ice-add-failed', errorMessage(error));
      }
      if (peer.closed) return;
    }
    if (this.role === 'guest') {
      const answer = await peer.connection.createAnswer();
      if (peer.closed) return;
      await peer.connection.setLocalDescription(answer);
      const description = peer.connection.localDescription ?? answer;
      if (description.sdp) this.sendSignal(peer.peerId, { kind: 'answer', sdp: description.sdp });
    }
  }

  private sendToPeer(peerId: string, message: NetworkMessage, kind: SessionDataChannel): void {
    const peer = this.peers.get(peerId);
    if (!peer || peer.closed) {
      this.reportError('peer-unavailable', 'That peer is not connected.');
      return;
    }
    if (!this.canSend(message.type)) {
      this.reportError('invalid-direction', 'This message is not allowed for the local peer role.');
      return;
    }
    const expectedWorld = this.roomCode ?? undefined;
    const parsed = parseNetworkMessage(JSON.stringify(message), expectedWorld);
    if (!parsed.ok) {
      this.reportError('invalid-message', `Outgoing message was rejected: ${parsed.error}.`);
      return;
    }
    const channel = kind === 'reliable' ? peer.reliable : peer.presence;
    if (!channel || channel.readyState !== 'open') {
      this.reportError('channel-unavailable', `The ${kind} channel is not open.`);
      return;
    }
    const payload = JSON.stringify(parsed.message);
    const payloadBytes = new TextEncoder().encode(payload).byteLength;
    const limit = kind === 'reliable' ? MAX_RELIABLE_BUFFER_BYTES : MAX_PRESENCE_BUFFER_BYTES;
    if (channel.bufferedAmount + payloadBytes > limit) {
      this.reportError(
        'send-buffer-full',
        `The ${kind} channel buffer is full; the message was not queued.`,
      );
      return;
    }
    try {
      channel.send(payload);
    } catch (error) {
      this.reportError('send-failed', errorMessage(error));
    }
  }

  private canReceive(type: NetworkMessage['type']): boolean {
    if (this.role === 'host') return type === 'hello' || type === 'input' || type === 'leave';
    return (
      type === 'accept' ||
      type === 'snapshot' ||
      type === 'player-state' ||
      type === 'world-delta' ||
      type === 'leave' ||
      type === 'error'
    );
  }

  private canSend(type: NetworkMessage['type']): boolean {
    if (this.role === 'host')
      return (
        type === 'accept' ||
        type === 'snapshot' ||
        type === 'player-state' ||
        type === 'world-delta' ||
        type === 'leave' ||
        type === 'error'
      );
    return type === 'hello' || type === 'input' || type === 'leave';
  }

  private sendSignal(peerId: string, data: PeerSignalData): void {
    if (!this.client || this.closed) return;
    try {
      this.client.sendSignal(peerId, data);
    } catch (error) {
      this.reportError('signal-send-failed', errorMessage(error));
    }
  }

  private async getIceServers(): Promise<RTCIceServer[]> {
    if (this.options.iceServers !== undefined) return this.options.iceServers;
    if (!this.iceServersPromise) this.iceServersPromise = this.fetchIceServers();
    return this.iceServersPromise;
  }

  private async fetchIceServers(): Promise<RTCIceServer[]> {
    try {
      const url = new URL(this.options.signalingUrl);
      url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
      url.pathname = '/ice';
      url.search = '';
      url.hash = '';
      const response = await this.fetcher(url.href, {
        method: 'GET',
        credentials: 'omit',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return [];
      const value: unknown = await response.json();
      const list = Array.isArray(value)
        ? value
        : typeof value === 'object' && value !== null && 'iceServers' in value
          ? value.iceServers
          : null;
      if (!Array.isArray(list) || list.length > 8) return [];
      return list.filter(isIceServer);
    } catch {
      return [];
    }
  }

  private removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer || peer.closed) return;
    this.peers.delete(peerId);
    this.disposePeer(peer, true);
  }

  private disposePeer(peer: PeerState, notify: boolean): void {
    if (peer.closed) return;
    peer.closed = true;
    try {
      peer.reliable?.close();
    } catch {
      // Cleanup continues even when a browser channel has already failed.
    }
    try {
      peer.presence?.close();
    } catch {
      // Cleanup continues even when a browser channel has already failed.
    }
    try {
      peer.connection.close();
    } catch {
      // Cleanup continues even when a browser peer connection has already failed.
    }
    if (notify) this.emit({ type: 'disconnected', peerId: peer.peerId });
  }

  private failStart(error: unknown): void {
    this.reportError('session-start-failed', errorMessage(error));
    const client = this.client;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.client = null;
    if (client) client.close();
    this.role = null;
    this.roomCode = null;
    this.localPeerId = null;
    this.hostPeerId = null;
  }

  private ensureOpen(): void {
    if (this.closed) throw new Error('Peer session is closed');
  }

  private reportError(code: string, message: string): void {
    this.emit({ type: 'error', code, message });
  }

  private emit(event: PeerSessionEvent): void {
    if (!this.closed) this.options.onEvent(event);
  }
}

function isIceServer(value: unknown): value is RTCIceServer {
  if (typeof value !== 'object' || value === null || !('urls' in value)) return false;
  const urls = value.urls;
  const validUrls =
    typeof urls === 'string'
      ? urls.length > 0 && urls.length <= 512
      : Array.isArray(urls) &&
        urls.length > 0 &&
        urls.length <= 8 &&
        urls.every(
          (url: unknown) => typeof url === 'string' && url.length > 0 && url.length <= 512,
        );
  if (!validUrls) return false;
  if ('username' in value && value.username !== undefined && typeof value.username !== 'string')
    return false;
  if (
    'credential' in value &&
    value.credential !== undefined &&
    typeof value.credential !== 'string'
  )
    return false;
  return true;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Peer session operation failed.';
}
