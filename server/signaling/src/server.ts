import { createHmac, randomBytes } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from 'node:http';
import { createRequire } from 'node:module';
import type { Socket as TcpSocket } from 'node:net';
import type { Duplex } from 'node:stream';

const require = createRequire(import.meta.url);

type SocketLike = {
  readonly readyState: number;
  readonly bufferedAmount: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: 'message', listener: (data: unknown, isBinary: boolean) => void): SocketLike;
  on(event: 'close', listener: (code: number) => void): SocketLike;
  on(event: 'error', listener: (error: Error) => void): SocketLike;
};

type WebSocketServerLike = {
  on(
    event: 'connection',
    listener: (client: SocketLike, request: IncomingMessage) => void,
  ): WebSocketServerLike;
  handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    callback: (client: SocketLike) => void,
  ): void;
  emit(event: 'connection', client: SocketLike, request: IncomingMessage): boolean;
  close(callback?: (error?: Error) => void): void;
};

type WsModule = {
  readonly WebSocketServer: new (options: {
    noServer: true;
    maxPayload: number;
    perMessageDeflate: false;
  }) => WebSocketServerLike;
  readonly OPEN: number;
};

// ws ships without declarations in the current dependency tree. This deliberately
// narrow adapter is replaced by @types/ws once ws is promoted to a direct root dep.
const ws = require('ws') as WsModule;

export interface PeerCapabilities {
  readonly protocolVersion: number;
  readonly dataChannel: boolean;
  readonly maxPayloadBytes: number;
}

type ClientMessage =
  | { readonly op: 'create' }
  | { readonly op: 'keepalive' }
  | { readonly op: 'join'; readonly roomCode: string; readonly capabilities: PeerCapabilities }
  | { readonly op: 'approve'; readonly peerId: string; readonly approved: boolean }
  | { readonly op: 'signal'; readonly to: string; readonly data: SignalData }
  | { readonly op: 'leave' };

type SignalData =
  | { readonly kind: 'offer' | 'answer'; readonly sdp: string }
  | {
      readonly kind: 'ice';
      readonly candidate: {
        readonly candidate: string;
        readonly sdpMid?: string | null;
        readonly sdpMLineIndex?: number | null;
        readonly usernameFragment?: string | null;
      };
    };

type Peer = {
  readonly id: string;
  readonly socket: SocketLike;
  readonly capabilities?: PeerCapabilities;
  approved: boolean;
};

type Room = {
  readonly code: string;
  readonly createdAt: number;
  hostPeerId: string;
  readonly peers: Map<string, Peer>;
};

type ClientState = {
  peer?: Peer;
  room?: Room;
  windowStartedAt: number;
  messagesInWindow: number;
};

export interface SignalingServerOptions {
  readonly host?: string;
  readonly port?: number;
  readonly allowedOrigins?: readonly string[];
  readonly turnUrls?: readonly string[];
  readonly turnSharedSecret?: string;
  readonly turnCredentialTtlSeconds?: number;
  readonly roomTtlMs?: number;
  readonly cleanupIntervalMs?: number;
  readonly maxPeersPerRoom?: number;
  readonly maxPayloadBytes?: number;
  readonly maxMessagesPerWindow?: number;
  readonly messageRateWindowMs?: number;
  readonly now?: () => number;
  readonly inviteCodeFactory?: () => string;
  readonly peerIdFactory?: () => string;
}

export interface RunningSignalingServer {
  readonly host: string;
  readonly port: number;
  readonly httpUrl: string;
  roomCount(): number;
  close(): Promise<void>;
}

const DEFAULT_ROOM_TTL_MS = 60 * 60 * 1_000;
const DEFAULT_MAX_PEERS_PER_ROOM = 4;
const DEFAULT_MAX_PAYLOAD_BYTES = 64 * 1_024;
const DEFAULT_RATE_LIMIT = 60;
const DEFAULT_RATE_WINDOW_MS = 10_000;
const DEFAULT_STUN_URLS = ['stun:stun.cloudflare.com:3478'] as const;
const MAX_SDP_CHARS = 16_384;
const MAX_ICE_CANDIDATE_CHARS = 4_096;
const PEER_ID_PATTERN = /^[a-f0-9]{24}$/;
const ROOM_CODE_PATTERN = /^[a-f0-9]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function validCapabilities(value: unknown): value is PeerCapabilities {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['protocolVersion', 'dataChannel', 'maxPayloadBytes'])
  )
    return false;
  return (
    Number.isInteger(value['protocolVersion']) &&
    Number(value['protocolVersion']) >= 1 &&
    Number(value['protocolVersion']) <= 10 &&
    typeof value['dataChannel'] === 'boolean' &&
    Number.isInteger(value['maxPayloadBytes']) &&
    Number(value['maxPayloadBytes']) >= 1_024 &&
    Number(value['maxPayloadBytes']) <= 65_536
  );
}

function validSignalData(value: unknown): value is SignalData {
  if (!isRecord(value) || typeof value['kind'] !== 'string') return false;
  const kind = value['kind'];
  if (kind === 'offer' || kind === 'answer') {
    return (
      hasOnlyKeys(value, ['kind', 'sdp']) &&
      typeof value['sdp'] === 'string' &&
      value['sdp'].length > 0 &&
      value['sdp'].length <= MAX_SDP_CHARS
    );
  }
  if (kind !== 'ice' || !hasOnlyKeys(value, ['kind', 'candidate'])) return false;
  const candidate = value['candidate'];
  if (
    !isRecord(candidate) ||
    !hasOnlyKeys(candidate, ['candidate', 'sdpMid', 'sdpMLineIndex', 'usernameFragment'])
  )
    return false;
  const candidateText = candidate['candidate'];
  const sdpMid = candidate['sdpMid'];
  const sdpMLineIndex = candidate['sdpMLineIndex'];
  const usernameFragment = candidate['usernameFragment'];
  return (
    typeof candidateText === 'string' &&
    candidateText.length > 0 &&
    candidateText.length <= MAX_ICE_CANDIDATE_CHARS &&
    (sdpMid === undefined ||
      sdpMid === null ||
      (typeof sdpMid === 'string' && sdpMid.length <= 128)) &&
    (sdpMLineIndex === undefined ||
      sdpMLineIndex === null ||
      (Number.isInteger(sdpMLineIndex) &&
        Number(sdpMLineIndex) >= 0 &&
        Number(sdpMLineIndex) <= 255)) &&
    (usernameFragment === undefined ||
      usernameFragment === null ||
      (typeof usernameFragment === 'string' && usernameFragment.length <= 256))
  );
}

function parseMessage(value: unknown): ClientMessage | null {
  if (!isRecord(value) || typeof value['op'] !== 'string') return null;
  switch (value['op']) {
    case 'create':
      return hasOnlyKeys(value, ['op']) ? { op: 'create' } : null;
    case 'keepalive':
      return hasOnlyKeys(value, ['op']) ? { op: 'keepalive' } : null;
    case 'join':
      if (
        !hasOnlyKeys(value, ['op', 'roomCode', 'capabilities']) ||
        typeof value['roomCode'] !== 'string' ||
        !ROOM_CODE_PATTERN.test(value['roomCode']) ||
        !validCapabilities(value['capabilities'])
      )
        return null;
      return {
        op: 'join',
        roomCode: value['roomCode'].toLowerCase(),
        capabilities: value['capabilities'],
      };
    case 'approve':
      if (
        !hasOnlyKeys(value, ['op', 'peerId', 'approved']) ||
        typeof value['peerId'] !== 'string' ||
        !PEER_ID_PATTERN.test(value['peerId']) ||
        typeof value['approved'] !== 'boolean'
      )
        return null;
      return { op: 'approve', peerId: value['peerId'], approved: value['approved'] };
    case 'signal':
      if (
        !hasOnlyKeys(value, ['op', 'to', 'data']) ||
        typeof value['to'] !== 'string' ||
        !PEER_ID_PATTERN.test(value['to']) ||
        !validSignalData(value['data'])
      )
        return null;
      return { op: 'signal', to: value['to'], data: value['data'] };
    case 'leave':
      return hasOnlyKeys(value, ['op']) ? { op: 'leave' } : null;
    default:
      return null;
  }
}

function toUtf8(data: unknown): string | null {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  if (Array.isArray(data) && data.every((part) => Buffer.isBuffer(part))) {
    return Buffer.concat(data as Buffer[]).toString('utf8');
  }
  return null;
}

function send(socket: SocketLike, value: Record<string, unknown>): void {
  if (socket.readyState === ws.OPEN) {
    const encoded = JSON.stringify(value);
    if (socket.bufferedAmount > 256 * 1_024 - Buffer.byteLength(encoded, 'utf8')) {
      socket.close(1013, 'signaling backpressure');
      return;
    }
    socket.send(encoded);
  }
}

function sendError(socket: SocketLike, code: string, message: string): void {
  send(socket, { op: 'error', code, message });
}

function sendRejected(socket: SocketLike, code: string, message: string): void {
  send(socket, { op: 'rejected', code, message });
}

function validateOptions(options: SignalingServerOptions): void {
  if (options.turnUrls?.some((url) => /^turns?:/i.test(url)) && !options.turnSharedSecret) {
    throw new Error('TURN_SHARED_SECRET is required when TURN_URLS is configured');
  }
  for (const url of options.turnUrls ?? []) {
    if (!/^(turn|turns|stun):[A-Za-z0-9.:[\]_-]+(?::\d+)?(?:\?[A-Za-z0-9=&_-]+)?$/i.test(url)) {
      throw new Error(`invalid ICE server URL: ${url}`);
    }
  }
  if (
    (options.maxPeersPerRoom ?? DEFAULT_MAX_PEERS_PER_ROOM) < 2 ||
    (options.maxPeersPerRoom ?? DEFAULT_MAX_PEERS_PER_ROOM) > 4
  ) {
    throw new Error('maxPeersPerRoom must be between 2 and 4');
  }
  if ((options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES) < 256)
    throw new Error('maxPayloadBytes must be at least 256');
  if (
    (options.turnCredentialTtlSeconds ?? 3_600) < 60 ||
    (options.turnCredentialTtlSeconds ?? 3_600) > 86_400
  ) {
    throw new Error('turnCredentialTtlSeconds must be between 60 and 86400');
  }
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
  requestOrigin?: string,
): void {
  const payload = JSON.stringify(body);
  const corsHeaders =
    requestOrigin === undefined
      ? {}
      : { 'access-control-allow-origin': requestOrigin, vary: 'Origin' };
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...corsHeaders,
  });
  response.end(payload);
}

function originAllowed(request: IncomingMessage, allowedOrigins: ReadonlySet<string>): boolean {
  const originHeader = request.headers.origin;
  if (originHeader === undefined) return true;
  if (Array.isArray(originHeader)) return false;
  return allowedOrigins.size === 0 || allowedOrigins.has(originHeader);
}

export async function startSignalingServer(
  options: SignalingServerOptions = {},
): Promise<RunningSignalingServer> {
  validateOptions(options);
  const host = options.host ?? '0.0.0.0';
  const port = options.port ?? 8_787;
  const now = options.now ?? Date.now;
  const inviteCodeFactory = options.inviteCodeFactory ?? (() => randomBytes(6).toString('hex'));
  const peerIdFactory = options.peerIdFactory ?? (() => randomBytes(12).toString('hex'));
  const roomTtlMs = options.roomTtlMs ?? DEFAULT_ROOM_TTL_MS;
  const cleanupIntervalMs = options.cleanupIntervalMs ?? Math.min(roomTtlMs, 60_000);
  const maxPeersPerRoom = options.maxPeersPerRoom ?? DEFAULT_MAX_PEERS_PER_ROOM;
  const maxPayloadBytes = options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
  const maxMessagesPerWindow = options.maxMessagesPerWindow ?? DEFAULT_RATE_LIMIT;
  const messageRateWindowMs = options.messageRateWindowMs ?? DEFAULT_RATE_WINDOW_MS;
  const turnUrls = options.turnUrls ?? DEFAULT_STUN_URLS;
  const allowedOrigins = new Set(options.allowedOrigins ?? []);
  const clients = new Map<SocketLike, ClientState>();
  const rooms = new Map<string, Room>();
  const wss = new ws.WebSocketServer({
    noServer: true,
    maxPayload: maxPayloadBytes,
    perMessageDeflate: false,
  });

  const sendIceConfiguration = (response: ServerResponse, requestOrigin?: string) => {
    const iceServers: Array<Record<string, unknown>> = [];
    const turnUrlsOnly = turnUrls.filter((url) => /^turns?:/i.test(url));
    const stunUrls = turnUrls.filter((url) => /^stun:/i.test(url));
    if (turnUrlsOnly.length > 0) {
      const ttl = options.turnCredentialTtlSeconds ?? 3_600;
      const username = `${Math.floor(now() / 1_000) + ttl}:${randomBytes(8).toString('hex')}`;
      const credential = createHmac('sha1', options.turnSharedSecret ?? '')
        .update(username)
        .digest('base64');
      iceServers.push({ urls: turnUrlsOnly, username, credential });
    }
    if (stunUrls.length > 0) iceServers.push({ urls: stunUrls });
    writeJson(response, 200, { iceServers }, requestOrigin);
  };

  const sendPeerLeft = (room: Room, peerId: string) => {
    for (const peer of room.peers.values()) {
      if (peer.id !== peerId && peer.approved) send(peer.socket, { op: 'peer-left', peerId });
    }
  };

  const closeRoom = (room: Room, reason: string) => {
    if (!rooms.delete(room.code)) return;
    for (const peer of room.peers.values()) {
      clients.delete(peer.socket);
      sendError(peer.socket, 'room-expired', reason);
      peer.socket.close(1001, 'room expired');
    }
  };

  const removePeer = (state: ClientState, socket: SocketLike) => {
    const peer = state.peer;
    const room = state.room;
    if (!peer || !room) {
      clients.delete(socket);
      return;
    }
    if (room.hostPeerId === peer.id) {
      for (const member of room.peers.values()) {
        if (member.id !== peer.id) {
          send(member.socket, { op: 'peer-left', peerId: peer.id });
          sendRejected(member.socket, 'host-left', 'The host left the room');
          member.socket.close(1001, 'host left');
          clients.delete(member.socket);
        }
      }
      rooms.delete(room.code);
      room.peers.clear();
      clients.delete(socket);
      return;
    }
    room.peers.delete(peer.id);
    clients.delete(socket);
    sendPeerLeft(room, peer.id);
  };

  const pruneExpiredRooms = () => {
    const currentTime = now();
    for (const room of rooms.values()) {
      if (currentTime - room.createdAt >= roomTtlMs)
        closeRoom(room, 'Invite room expired after 60 minutes');
    }
  };

  const errorAndClose = (socket: SocketLike, code: string, message: string, closeCode = 1008) => {
    sendError(socket, code, message);
    socket.close(closeCode, message.slice(0, 120));
    const state = clients.get(socket);
    if (state) removePeer(state, socket);
  };

  const newPeerId = (room: Room): string | null => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = peerIdFactory();
      if (PEER_ID_PATTERN.test(candidate) && !room.peers.has(candidate)) return candidate;
    }
    return null;
  };

  const processMessage = (socket: SocketLike, rawData: unknown, isBinary: boolean) => {
    const state = clients.get(socket);
    if (!state) return;
    const currentTime = now();
    if (currentTime - state.windowStartedAt >= messageRateWindowMs) {
      state.windowStartedAt = currentTime;
      state.messagesInWindow = 0;
    }
    state.messagesInWindow += 1;
    if (state.messagesInWindow > maxMessagesPerWindow) {
      errorAndClose(socket, 'rate-limited', 'Too many signaling messages', 1008);
      return;
    }
    if (isBinary) {
      sendError(socket, 'invalid-message', 'Signaling messages must be JSON text');
      return;
    }
    const payload = toUtf8(rawData);
    if (payload === null || Buffer.byteLength(payload, 'utf8') > maxPayloadBytes) {
      errorAndClose(
        socket,
        'payload-too-large',
        'Signaling message exceeded the payload limit',
        1009,
      );
      return;
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(payload) as unknown;
    } catch {
      sendError(socket, 'invalid-message', 'Message must be valid JSON');
      return;
    }
    const message = parseMessage(decoded);
    if (!message) {
      const isSignal = isRecord(decoded) && decoded['op'] === 'signal';
      sendError(
        socket,
        isSignal ? 'invalid-signal' : 'invalid-message',
        'Unknown operation or invalid message shape',
      );
      return;
    }
    pruneExpiredRooms();

    if (message.op === 'keepalive') {
      send(socket, { op: 'alive' });
      return;
    }

    if (message.op === 'create') {
      if (state.peer) {
        sendError(socket, 'already-in-room', 'Leave the current room before creating another');
        return;
      }
      let code: string | null = null;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = inviteCodeFactory();
        if (ROOM_CODE_PATTERN.test(candidate) && !rooms.has(candidate)) {
          code = candidate;
          break;
        }
      }
      if (!code) {
        sendError(socket, 'room-create-failed', 'Unable to allocate a unique invite code');
        return;
      }
      const room: Room = { code, createdAt: currentTime, hostPeerId: '', peers: new Map() };
      const peerId = newPeerId(room);
      if (!peerId) {
        sendError(socket, 'room-create-failed', 'Unable to allocate a peer identifier');
        return;
      }
      const hostPeer: Peer = { id: peerId, socket, approved: true };
      room.hostPeerId = peerId;
      room.peers.set(peerId, hostPeer);
      rooms.set(code, room);
      state.peer = hostPeer;
      state.room = room;
      send(socket, { op: 'created', roomCode: code, peerId, expiresAt: currentTime + roomTtlMs });
      return;
    }

    if (message.op === 'join') {
      if (state.peer) {
        sendRejected(socket, 'already-in-room', 'Leave the current room before joining another');
        return;
      }
      const room = rooms.get(message.roomCode);
      if (!room) {
        sendRejected(socket, 'room-not-found', 'No active room has that invite code');
        return;
      }
      if (room.peers.size >= maxPeersPerRoom) {
        sendRejected(socket, 'room-full', `Rooms allow at most ${maxPeersPerRoom} peers`);
        return;
      }
      const peerId = newPeerId(room);
      if (!peerId) {
        sendRejected(socket, 'join-failed', 'Unable to allocate a peer identifier');
        return;
      }
      const peer: Peer = {
        id: peerId,
        socket,
        approved: false,
        capabilities: message.capabilities,
      };
      room.peers.set(peerId, peer);
      state.peer = peer;
      state.room = room;
      send(socket, {
        op: 'waiting',
        peerId,
        roomCode: room.code,
        hostId: room.hostPeerId,
        expiresAt: currentTime + roomTtlMs,
      });
      const host = room.peers.get(room.hostPeerId);
      if (host)
        send(host.socket, { op: 'join-request', peerId, capabilities: message.capabilities });
      return;
    }

    if (message.op === 'approve') {
      const room = state.room;
      const requester = state.peer;
      if (!room || !requester || requester.id !== room.hostPeerId) {
        sendError(socket, 'host-only', 'Only the host can approve join requests');
        return;
      }
      const guest = room.peers.get(message.peerId);
      if (!guest || guest.id === room.hostPeerId || guest.approved) {
        sendError(socket, 'peer-not-pending', 'That peer is not waiting for approval');
        return;
      }
      if (!message.approved) {
        room.peers.delete(guest.id);
        clients.delete(guest.socket);
        sendRejected(guest.socket, 'host-rejected', 'The host did not approve this join request');
        guest.socket.close(1008, 'join rejected');
        return;
      }
      guest.approved = true;
      const approvedPeers = Array.from(room.peers.values())
        .filter((peer) => peer.approved && peer.id === room.hostPeerId)
        .map((peer) => ({ peerId: peer.id }));
      send(guest.socket, {
        op: 'approved',
        peerId: guest.id,
        roomCode: room.code,
        peers: approvedPeers,
      });
      send(socket, { op: 'peer-approved', peerId: guest.id, capabilities: guest.capabilities });
      return;
    }

    if (message.op === 'signal') {
      const room = state.room;
      const sender = state.peer;
      if (!room || !sender || !sender.approved) {
        sendError(socket, 'not-approved', 'Only approved room members may signal');
        return;
      }
      const recipient = room.peers.get(message.to);
      if (!recipient || !recipient.approved || recipient.id === sender.id) {
        sendError(socket, 'not-approved', 'Signal recipient is not an approved room member');
        return;
      }
      if (sender.id !== room.hostPeerId && recipient.id !== room.hostPeerId) {
        sendError(socket, 'not-approved', 'Guests may only signal to or from the host');
        return;
      }
      if (
        (message.data.kind === 'offer' && sender.id !== room.hostPeerId) ||
        (message.data.kind === 'answer' && recipient.id !== room.hostPeerId)
      ) {
        sendError(socket, 'invalid-signal', 'The host offers and guests answer');
        return;
      }
      send(recipient.socket, { op: 'signal', from: sender.id, data: message.data });
      return;
    }

    if (message.op === 'leave') {
      removePeer(state, socket);
      socket.close(1000, 'left room');
    }
  };

  const httpServer: HttpServer = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (!originAllowed(request, allowedOrigins)) {
      writeJson(response, 403, { error: 'origin-not-allowed' });
      return;
    }
    const requestOrigin = Array.isArray(request.headers.origin)
      ? undefined
      : request.headers.origin;
    if (request.method === 'OPTIONS' && url.pathname === '/ice') {
      const headers =
        requestOrigin === undefined
          ? {}
          : { 'access-control-allow-origin': requestOrigin, vary: 'Origin' };
      response.writeHead(204, {
        ...headers,
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': 'Content-Type',
        'access-control-max-age': '600',
      });
      response.end();
      return;
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      writeJson(response, 200, { status: 'ok' }, requestOrigin);
      return;
    }
    if (request.method === 'GET' && url.pathname === '/ice') {
      sendIceConfiguration(response, requestOrigin);
      return;
    }
    writeJson(response, 404, { error: 'not-found' }, requestOrigin);
  });

  httpServer.on('upgrade', (request, socket: TcpSocket, head) => {
    if (!originAllowed(request, allowedOrigins)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    const upgradePath = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (upgradePath !== '/' && upgradePath !== '/signal') {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    wss.handleUpgrade(request, socket, head, (client) => {
      wss.emit('connection', client, request);
    });
  });

  wss.on('connection', (socket) => {
    const state: ClientState = { windowStartedAt: now(), messagesInWindow: 0 };
    clients.set(socket, state);
    socket.on('message', (data, isBinary) => processMessage(socket, data, isBinary));
    socket.on('close', () => removePeer(state, socket));
    socket.on('error', () => removePeer(state, socket));
  });

  const cleanupTimer = setInterval(pruneExpiredRooms, cleanupIntervalMs);
  cleanupTimer.unref();

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => {
      httpServer.removeListener('error', reject);
      resolve();
    });
  });
  const address = httpServer.address();
  if (!address || typeof address === 'string') {
    clearInterval(cleanupTimer);
    throw new Error('signaling HTTP server did not bind a TCP port');
  }
  const boundPort = address.port;

  return {
    host,
    port: boundPort,
    httpUrl: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${boundPort}`,
    roomCount: () => rooms.size,
    close: async () => {
      clearInterval(cleanupTimer);
      for (const client of clients.keys()) client.close(1001, 'server shutdown');
      rooms.clear();
      clients.clear();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}

export interface SignalingEnvironment {
  readonly HOST?: string;
  readonly PORT?: string;
  readonly ALLOWED_ORIGINS?: string;
  readonly TURN_URLS?: string;
  readonly TURN_SHARED_SECRET?: string;
  readonly TURN_CREDENTIAL_TTL_SECONDS?: string;
}

export function signalingOptionsFromEnvironment(
  environment: SignalingEnvironment,
): SignalingServerOptions {
  const port = environment.PORT === undefined ? undefined : Number(environment.PORT);
  const ttl =
    environment.TURN_CREDENTIAL_TTL_SECONDS === undefined
      ? undefined
      : Number(environment.TURN_CREDENTIAL_TTL_SECONDS);
  if (port !== undefined && (!Number.isInteger(port) || port < 0 || port > 65_535))
    throw new Error('PORT must be an integer from 0 to 65535');
  if (ttl !== undefined && !Number.isInteger(ttl))
    throw new Error('TURN_CREDENTIAL_TTL_SECONDS must be an integer');
  return {
    ...(environment.HOST === undefined ? {} : { host: environment.HOST }),
    ...(port === undefined ? {} : { port }),
    ...(environment.ALLOWED_ORIGINS === undefined
      ? {}
      : {
          allowedOrigins: environment.ALLOWED_ORIGINS.split(',')
            .map((origin) => origin.trim())
            .filter(Boolean),
        }),
    ...(environment.TURN_URLS === undefined
      ? {}
      : {
          turnUrls: environment.TURN_URLS.split(',')
            .map((url) => url.trim())
            .filter(Boolean),
        }),
    ...(environment.TURN_SHARED_SECRET === undefined
      ? {}
      : { turnSharedSecret: environment.TURN_SHARED_SECRET }),
    ...(ttl === undefined ? {} : { turnCredentialTtlSeconds: ttl }),
  };
}
