export interface SignalCapabilities {
  readonly protocolVersion: number;
  readonly dataChannel: boolean;
  readonly maxPayloadBytes: number;
}

export type SessionDescriptionSignal = {
  readonly kind: 'offer' | 'answer';
  readonly sdp: string;
};

export type IceCandidateSignal = {
  readonly kind: 'ice';
  readonly candidate: RTCIceCandidateInit;
};

export type PeerSignalData = SessionDescriptionSignal | IceCandidateSignal;

export type SignalingEvent =
  | { readonly op: 'alive' }
  | {
      readonly op: 'created';
      readonly roomCode: string;
      readonly peerId: string;
      readonly expiresAt: number;
    }
  | {
      readonly op: 'waiting';
      readonly roomCode: string;
      readonly peerId: string;
      readonly hostId: string;
      readonly expiresAt: number;
    }
  | {
      readonly op: 'join-request';
      readonly peerId: string;
      readonly capabilities: Readonly<Record<string, unknown>>;
    }
  | { readonly op: 'approved'; readonly roomCode: string; readonly peerId: string }
  | {
      readonly op: 'peer-approved';
      readonly peerId: string;
      readonly capabilities: Readonly<Record<string, unknown>>;
    }
  | { readonly op: 'rejected'; readonly reason: string }
  | { readonly op: 'signal'; readonly from: string; readonly data: PeerSignalData }
  | { readonly op: 'peer-left'; readonly peerId: string }
  | { readonly op: 'error'; readonly code: string; readonly message: string }
  | { readonly op: 'closed'; readonly reason: string };

type SocketFactory = (url: string) => WebSocket;
type PendingOperation = {
  readonly expectedOp: 'created' | 'waiting';
  readonly resolve: (event: SignalingEvent) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
};

const SOCKET_OPEN = 1;
const MAX_SIGNAL_BYTES = 65_536;
const ROOM_CODE_PATTERN = /^[0-9a-f]{12}$/i;
const PEER_ID_PATTERN = /^[0-9a-f]{24}$/i;
const DEFAULT_KEEPALIVE_INTERVAL_MS = 4 * 60 * 1_000;

export class SignalingClient {
  private socket: WebSocket | null = null;
  private connectPromise: Promise<void> | null = null;
  private pendingOperation: PendingOperation | null = null;
  private readonly listeners = new Set<(event: SignalingEvent) => void>();
  private closed = false;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly url: string,
    private readonly socketFactory: SocketFactory = (socketUrl) => new WebSocket(socketUrl),
    private readonly requestTimeoutMs = 8_000,
    private readonly keepaliveIntervalMs = DEFAULT_KEEPALIVE_INTERVAL_MS,
  ) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:')
      throw new TypeError('Signaling URL must use ws:// or wss://');
    if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 250 || requestTimeoutMs > 60_000)
      throw new RangeError('Signaling request timeout must be between 250 and 60000 ms');
    if (
      !Number.isInteger(keepaliveIntervalMs) ||
      keepaliveIntervalMs < 1_000 ||
      keepaliveIntervalMs > 900_000
    )
      throw new RangeError('Signaling keepalive interval must be between 1000 and 900000 ms');
  }

  connect(): Promise<void> {
    if (this.closed) return Promise.reject(new Error('Signaling client is closed'));
    if (this.socket?.readyState === SOCKET_OPEN) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = new Promise<void>((resolve, reject) => {
      let socket: WebSocket;
      try {
        socket = this.socketFactory(this.url);
      } catch (error) {
        this.connectPromise = null;
        reject(error instanceof Error ? error : new Error('Could not open signaling socket'));
        return;
      }
      this.socket = socket;
      socket.onopen = () => {
        this.connectPromise = null;
        this.startKeepalive(socket);
        resolve();
      };
      socket.onmessage = (event) => this.onMessage(event.data);
      socket.onerror = () => {
        const error = new Error('Signaling connection failed');
        this.rejectPending(error);
        if (this.connectPromise) {
          this.connectPromise = null;
          reject(error);
        }
      };
      socket.onclose = () => {
        this.stopKeepalive();
        this.rejectPending(new Error('Signaling connection closed'));
        this.emit({ op: 'closed', reason: 'Signaling connection closed.' });
        this.socket = null;
        this.connectPromise = null;
      };
    });
    return this.connectPromise;
  }

  async createRoom(): Promise<Extract<SignalingEvent, { op: 'created' }>> {
    await this.connect();
    const event = await this.request('created', { op: 'create' });
    if (event.op !== 'created')
      throw new Error('Signaling server returned an invalid room response');
    return event;
  }

  async joinRoom(
    roomCode: string,
    capabilities: SignalCapabilities,
  ): Promise<Extract<SignalingEvent, { op: 'waiting' }>> {
    if (!ROOM_CODE_PATTERN.test(roomCode)) throw new TypeError('Invite code is invalid');
    await this.connect();
    const event = await this.request('waiting', {
      op: 'join',
      roomCode: roomCode.toUpperCase(),
      capabilities,
    });
    if (event.op !== 'waiting')
      throw new Error('Signaling server returned an invalid join response');
    return event;
  }

  approvePeer(peerId: string, approved: boolean): void {
    if (!PEER_ID_PATTERN.test(peerId)) throw new TypeError('Peer identifier is invalid');
    this.send({ op: 'approve', peerId, approved });
  }

  sendSignal(peerId: string, data: PeerSignalData): void {
    if (!PEER_ID_PATTERN.test(peerId)) throw new TypeError('Peer identifier is invalid');
    if (!isPeerSignalData(data)) throw new TypeError('Peer signaling data is invalid');
    this.send({ op: 'signal', to: peerId, data });
  }

  subscribe(listener: (event: SignalingEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  leave(): void {
    if (this.socket?.readyState === SOCKET_OPEN) this.send({ op: 'leave' });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.stopKeepalive();
    this.rejectPending(new Error('Signaling client is closed'));
    const socket = this.socket;
    this.socket = null;
    if (socket?.readyState === SOCKET_OPEN) socket.close();
    this.listeners.clear();
  }

  private request(
    expectedOp: 'created' | 'waiting',
    message: Readonly<Record<string, unknown>>,
  ): Promise<SignalingEvent> {
    if (this.pendingOperation)
      return Promise.reject(new Error('A signaling request is already pending'));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingOperation = null;
        reject(new Error('Signaling request timed out'));
      }, this.requestTimeoutMs);
      this.pendingOperation = { expectedOp, resolve, reject, timeout };
      try {
        this.send(message);
      } catch (error) {
        this.clearPending();
        reject(error instanceof Error ? error : new Error('Could not send signaling request'));
      }
    });
  }

  private send(message: Readonly<Record<string, unknown>>): void {
    if (this.socket?.readyState !== SOCKET_OPEN) throw new Error('Signaling is not connected');
    const serialized = JSON.stringify(message);
    if (new TextEncoder().encode(serialized).byteLength > MAX_SIGNAL_BYTES)
      throw new RangeError('Signaling message exceeds the size limit');
    this.socket.send(serialized);
  }

  private onMessage(data: unknown): void {
    if (typeof data !== 'string' || new TextEncoder().encode(data).byteLength > MAX_SIGNAL_BYTES) {
      this.emit({ op: 'error', code: 'invalid-message', message: 'Invalid signaling message.' });
      return;
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(data);
    } catch {
      this.emit({ op: 'error', code: 'invalid-message', message: 'Invalid signaling message.' });
      return;
    }
    const event = parseSignalingEvent(decoded);
    if (!event) {
      this.emit({ op: 'error', code: 'invalid-message', message: 'Invalid signaling message.' });
      return;
    }
    if (event.op === 'error' && this.pendingOperation) {
      this.pendingOperation.reject(new Error(event.message));
      this.clearPending();
    } else if (event.op === 'rejected' && this.pendingOperation) {
      this.pendingOperation.reject(new Error(event.reason));
      this.clearPending();
    } else if (
      this.pendingOperation &&
      (event.op === 'created' || event.op === 'waiting') &&
      event.op === this.pendingOperation.expectedOp
    ) {
      this.pendingOperation.resolve(event);
      this.clearPending();
    }
    this.emit(event);
  }

  private startKeepalive(socket: WebSocket): void {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => {
      if (this.socket !== socket || socket.readyState !== SOCKET_OPEN) return;
      try {
        this.send({ op: 'keepalive' });
      } catch {
        socket.close();
      }
    }, this.keepaliveIntervalMs);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer === null) return;
    clearInterval(this.keepaliveTimer);
    this.keepaliveTimer = null;
  }

  private emit(event: SignalingEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private clearPending(): void {
    if (!this.pendingOperation) return;
    clearTimeout(this.pendingOperation.timeout);
    this.pendingOperation = null;
  }

  private rejectPending(error: Error): void {
    if (!this.pendingOperation) return;
    this.pendingOperation.reject(error);
    this.clearPending();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validString(value: unknown, maxLength = 256): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function isPeerSignalData(value: unknown): value is PeerSignalData {
  if (!isRecord(value)) return false;
  if (value['kind'] === 'offer' || value['kind'] === 'answer')
    return validString(value['sdp'], MAX_SIGNAL_BYTES - 256);
  if (value['kind'] !== 'ice' || !isRecord(value['candidate'])) return false;
  return (
    validString(value['candidate']['candidate'], 2_048) &&
    (value['candidate']['sdpMid'] === null ||
      typeof value['candidate']['sdpMid'] === 'string' ||
      value['candidate']['sdpMid'] === undefined) &&
    (value['candidate']['sdpMLineIndex'] === null ||
      (Number.isInteger(value['candidate']['sdpMLineIndex']) &&
        Number(value['candidate']['sdpMLineIndex']) >= 0) ||
      value['candidate']['sdpMLineIndex'] === undefined)
  );
}

function parseSignalingEvent(value: unknown): SignalingEvent | null {
  if (!isRecord(value) || !validString(value['op'], 32)) return null;
  switch (value['op']) {
    case 'alive':
      return Object.keys(value).length === 1 ? { op: 'alive' } : null;
    case 'created':
      return ROOM_CODE_PATTERN.test(String(value['roomCode'])) &&
        PEER_ID_PATTERN.test(String(value['peerId'])) &&
        Number.isFinite(value['expiresAt'])
        ? {
            op: 'created',
            roomCode: String(value['roomCode']).toUpperCase(),
            peerId: String(value['peerId']),
            expiresAt: Number(value['expiresAt']),
          }
        : null;
    case 'waiting':
      return ROOM_CODE_PATTERN.test(String(value['roomCode'])) &&
        PEER_ID_PATTERN.test(String(value['peerId'])) &&
        PEER_ID_PATTERN.test(String(value['hostId'])) &&
        Number.isFinite(value['expiresAt'])
        ? {
            op: 'waiting',
            roomCode: String(value['roomCode']).toUpperCase(),
            peerId: String(value['peerId']),
            hostId: String(value['hostId']),
            expiresAt: Number(value['expiresAt']),
          }
        : null;
    case 'join-request':
    case 'peer-approved':
      return PEER_ID_PATTERN.test(String(value['peerId'])) && isRecord(value['capabilities'])
        ? { op: value['op'], peerId: String(value['peerId']), capabilities: value['capabilities'] }
        : null;
    case 'approved':
      return ROOM_CODE_PATTERN.test(String(value['roomCode'])) &&
        PEER_ID_PATTERN.test(String(value['peerId']))
        ? {
            op: 'approved',
            roomCode: String(value['roomCode']).toUpperCase(),
            peerId: String(value['peerId']),
          }
        : null;
    case 'rejected':
      return validString(value['reason'], 256) ? { op: 'rejected', reason: value['reason'] } : null;
    case 'signal':
      return PEER_ID_PATTERN.test(String(value['from'])) && isPeerSignalData(value['data'])
        ? { op: 'signal', from: String(value['from']), data: value['data'] }
        : null;
    case 'peer-left':
      return PEER_ID_PATTERN.test(String(value['peerId']))
        ? { op: 'peer-left', peerId: String(value['peerId']) }
        : null;
    case 'error':
      return validString(value['code'], 64) && validString(value['message'], 256)
        ? { op: 'error', code: value['code'], message: value['message'] }
        : null;
    default:
      return null;
  }
}
