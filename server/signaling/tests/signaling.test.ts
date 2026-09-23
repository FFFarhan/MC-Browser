import { createConnection } from 'node:net';
import { createHmac, randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  signalingOptionsFromEnvironment,
  startSignalingServer,
  type RunningSignalingServer,
} from '../src/server.js';

const servers: RunningSignalingServer[] = [];

async function start(options: Parameters<typeof startSignalingServer>[0] = {}) {
  const server = await startSignalingServer({ host: '127.0.0.1', port: 0, ...options });
  servers.push(server);
  return server;
}

async function connect(port: number, path = '/'): Promise<WebSocket> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  if (socket.readyState === WebSocket.OPEN) return socket;
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error('websocket failed to connect')), {
      once: true,
    });
  });
  return socket;
}

function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    socket.addEventListener(
      'message',
      (event) => {
        try {
          const value: unknown = JSON.parse(String(event.data));
          if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            reject(new Error('expected an object event'));
            return;
          }
          resolve(value as Record<string, unknown>);
        } catch (error) {
          reject(error);
        }
      },
      { once: true },
    );
    socket.addEventListener('error', () => reject(new Error('websocket errored')), { once: true });
  });
}

function send(socket: WebSocket, payload: unknown): void {
  socket.send(JSON.stringify(payload));
}

function waitForClose(socket: WebSocket): Promise<CloseEvent> {
  return new Promise((resolve) => {
    socket.addEventListener('close', resolve, { once: true });
  });
}

async function rawHandshake(port: number, origin: string): Promise<number> {
  return await new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const key = randomBytes(16).toString('base64');
    let response = '';
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('websocket handshake timed out'));
    }, 2_000);
    socket.once('connect', () => {
      socket.write(
        `GET / HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
          `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nOrigin: ${origin}\r\n\r\n`,
      );
    });
    socket.on('data', (chunk) => {
      response += chunk.toString('utf8');
      if (response.includes('\r\n\r\n')) {
        clearTimeout(timeout);
        socket.destroy();
        resolve(Number(/^HTTP\/1\.1 (\d+)/.exec(response)?.[1]));
      }
    });
    socket.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe('signaling HTTP endpoints', () => {
  it('parses executable environment settings and rejects invalid ports', () => {
    expect(
      signalingOptionsFromEnvironment({
        HOST: '127.0.0.1',
        PORT: '9000',
        ALLOWED_ORIGINS: 'https://game.example, https://staging.example ',
        TURN_URLS: 'turn:relay.example:3478, stun:stun.example:3478',
        TURN_SHARED_SECRET: 'secret',
        TURN_CREDENTIAL_TTL_SECONDS: '1800',
      }),
    ).toEqual({
      host: '127.0.0.1',
      port: 9000,
      allowedOrigins: ['https://game.example', 'https://staging.example'],
      turnUrls: ['turn:relay.example:3478', 'stun:stun.example:3478'],
      turnSharedSecret: 'secret',
      turnCredentialTtlSeconds: 1800,
    });
    expect(() => signalingOptionsFromEnvironment({ PORT: '70000' })).toThrow('PORT');
  });

  it('serves health and returns ephemeral TURN REST credentials without exposing the shared secret', async () => {
    let now = 1_800_000_000_000;
    const secret = 'private-turn-secret';
    const server = await start({
      now: () => now,
      turnUrls: ['turn:turn.example.net:3478?transport=udp', 'stun:stun.example.net:3478'],
      turnSharedSecret: secret,
      turnCredentialTtlSeconds: 600,
    });
    const health = await fetch(`${server.httpUrl}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });

    const response = await fetch(`${server.httpUrl}/ice`);
    const body = (await response.json()) as { iceServers: Array<Record<string, unknown>> };
    expect(response.status).toBe(200);
    expect(body.iceServers).toHaveLength(2);
    const turn = body.iceServers[0]!;
    const username = String(turn['username']);
    const expiresAt = Math.floor(now / 1000) + 600;
    expect(username).toMatch(new RegExp(`^${expiresAt}:`));
    expect(turn['credential']).toBe(createHmac('sha1', secret).update(username).digest('base64'));
    expect(JSON.stringify(body)).not.toContain(secret);

    now += 15_000;
    const refreshed = (await (await fetch(`${server.httpUrl}/ice`)).json()) as {
      iceServers: Array<Record<string, unknown>>;
    };
    expect(refreshed.iceServers[0]?.['username']).not.toBe(username);
  });

  it('provides a public STUN address-discovery server when TURN is not configured', async () => {
    const server = await start();
    const response = await fetch(`${server.httpUrl}/ice`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }],
    });
  });

  it('enforces the configured browser-origin allowlist on websocket upgrades', async () => {
    const server = await start({ allowedOrigins: ['https://play.stonefield.example'] });
    expect(await rawHandshake(server.port, 'https://play.stonefield.example')).toBe(101);
    expect(await rawHandshake(server.port, 'https://evil.example')).toBe(403);

    const allowedIce = await fetch(`${server.httpUrl}/ice`, {
      headers: { Origin: 'https://play.stonefield.example' },
    });
    expect(allowedIce.status).toBe(200);
    expect(allowedIce.headers.get('access-control-allow-origin')).toBe(
      'https://play.stonefield.example',
    );
    const deniedIce = await fetch(`${server.httpUrl}/ice`, {
      headers: { Origin: 'https://evil.example' },
    });
    expect(deniedIce.status).toBe(403);
    const preflight = await fetch(`${server.httpUrl}/ice`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://play.stonefield.example',
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-methods')).toContain('GET');
  });
});

describe('room signaling lifecycle', () => {
  it('accepts the documented /signal endpoint used by the browser runtime', async () => {
    const server = await start();
    const socket = await connect(server.port, '/signal');
    const created = nextMessage(socket);
    send(socket, { op: 'create' });
    expect(await created).toMatchObject({ op: 'created' });
    socket.close();
  });

  it('accepts idle-room keepalives so active rooms survive free websocket idling', async () => {
    const server = await start();
    const host = await connect(server.port, '/signal');
    const createdPromise = nextMessage(host);
    send(host, { op: 'create' });
    expect((await createdPromise)['op']).toBe('created');

    const alivePromise = nextMessage(host);
    send(host, { op: 'keepalive' });

    expect(await alivePromise).toEqual({ op: 'alive' });
    expect(server.roomCount()).toBe(1);
    host.close();
  });

  it('creates an invite, queues a guest for host approval, and forwards only approved peer signals', async () => {
    const server = await start();
    const host = await connect(server.port);
    const guest = await connect(server.port);

    const createdPromise = nextMessage(host);
    send(host, { op: 'create' });
    const created = await createdPromise;
    expect(created['op']).toBe('created');
    expect(created['roomCode']).toMatch(/^[a-f0-9]{12}$/);
    expect(created['peerId']).toMatch(/^[a-f0-9]{24}$/);
    const hostPeerId = String(created['peerId']);

    const waitingPromise = nextMessage(guest);
    const requestPromise = nextMessage(host);
    send(guest, {
      op: 'join',
      roomCode: String(created['roomCode']).toUpperCase(),
      capabilities: { protocolVersion: 1, dataChannel: true, maxPayloadBytes: 16_384 },
    });
    const waiting = await waitingPromise;
    const request = await requestPromise;
    expect(waiting).toMatchObject({ op: 'waiting', hostId: hostPeerId });
    expect(waiting['expiresAt']).toEqual(expect.any(Number));
    expect(request['op']).toBe('join-request');
    const guestPeerId = String(waiting['peerId']);
    expect(request['peerId']).toBe(guestPeerId);

    const blockedSignal = nextMessage(guest);
    send(guest, {
      op: 'signal',
      to: hostPeerId,
      data: { kind: 'answer', sdp: 'not-yet-approved' },
    });
    expect((await blockedSignal)['code']).toBe('not-approved');

    const approvedPromise = nextMessage(guest);
    const peerApprovedPromise = nextMessage(host);
    send(host, { op: 'approve', peerId: guestPeerId, approved: true });
    expect((await approvedPromise)['op']).toBe('approved');
    expect((await peerApprovedPromise)['op']).toBe('peer-approved');

    const forwardedPromise = nextMessage(guest);
    send(host, { op: 'signal', to: guestPeerId, data: { kind: 'offer', sdp: 'v=0\r\no=host' } });
    const forwarded = await forwardedPromise;
    expect(forwarded['op']).toBe('signal');
    expect(forwarded['from']).toBe(hostPeerId);
    expect(forwarded['data']).toEqual({ kind: 'offer', sdp: 'v=0\r\no=host' });

    const icePromise = nextMessage(guest);
    const iceData = {
      kind: 'ice',
      candidate: {
        candidate: 'candidate:1 1 udp 1 192.0.2.1 5000 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
        usernameFragment: 'ufrag',
      },
    };
    send(host, { op: 'signal', to: guestPeerId, data: iceData });
    expect((await icePromise)['data']).toEqual(iceData);

    const answerPromise = nextMessage(host);
    send(guest, { op: 'signal', to: hostPeerId, data: { kind: 'answer', sdp: 'v=0\r\no=guest' } });
    expect((await answerPromise)['from']).toBe(guestPeerId);

    const invalidOfferPromise = nextMessage(guest);
    send(guest, { op: 'signal', to: hostPeerId, data: { kind: 'offer', sdp: 'v=0\r\no=guest' } });
    expect((await invalidOfferPromise)['code']).toBe('invalid-signal');

    const secondGuest = await connect(server.port);
    const secondWaitingPromise = nextMessage(secondGuest);
    const secondRequestPromise = nextMessage(host);
    send(secondGuest, {
      op: 'join',
      roomCode: created['roomCode'],
      capabilities: { protocolVersion: 1, dataChannel: true, maxPayloadBytes: 16_384 },
    });
    const secondWaiting = await secondWaitingPromise;
    await secondRequestPromise;
    const secondApprovedPromise = nextMessage(secondGuest);
    const secondPeerApprovedPromise = nextMessage(host);
    send(host, { op: 'approve', peerId: secondWaiting['peerId'], approved: true });
    const secondApproved = await secondApprovedPromise;
    await secondPeerApprovedPromise;
    expect(secondApproved['peers']).toEqual([{ peerId: hostPeerId }]);
    const guestToGuestPromise = nextMessage(guest);
    send(guest, {
      op: 'signal',
      to: secondWaiting['peerId'],
      data: { kind: 'answer', sdp: 'v=0\r\no=guest' },
    });
    expect((await guestToGuestPromise)['code']).toBe('not-approved');

    const leftPromise = nextMessage(host);
    guest.close();
    expect((await leftPromise)['op']).toBe('peer-left');
    expect(server.roomCount()).toBe(1);
    host.close();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(server.roomCount()).toBe(0);
  });

  it('rejects unapproved guests and caps total peers at four', async () => {
    const server = await start();
    const host = await connect(server.port);
    const createdPromise = nextMessage(host);
    send(host, { op: 'create' });
    const roomCode = (await createdPromise)['roomCode'];

    const guests = await Promise.all(Array.from({ length: 4 }, () => connect(server.port)));
    for (const guest of guests) {
      const waitingPromise = nextMessage(guest);
      const requestPromise = nextMessage(host);
      send(guest, {
        op: 'join',
        roomCode,
        capabilities: { protocolVersion: 1, dataChannel: true, maxPayloadBytes: 16_384 },
      });
      const waiting = await waitingPromise;
      if (waiting['op'] === 'waiting') {
        await requestPromise;
      } else {
        expect(waiting['op']).toBe('rejected');
        expect(waiting['code']).toBe('room-full');
      }
    }
    expect(server.roomCount()).toBe(1);
    for (const guest of guests) guest.close();
    host.close();
  });

  it('expires rooms after the configured lifetime and cleans up idle rooms', async () => {
    let now = 1_800_000_000_000;
    const server = await start({ now: () => now, roomTtlMs: 3_600_000, cleanupIntervalMs: 10 });
    const host = await connect(server.port);
    const createdPromise = nextMessage(host);
    send(host, { op: 'create' });
    const code = (await createdPromise)['roomCode'];
    expect(server.roomCount()).toBe(1);
    now += 3_600_001;
    await expect.poll(() => server.roomCount()).toBe(0);

    const guest = await connect(server.port);
    const rejectedPromise = nextMessage(guest);
    send(guest, {
      op: 'join',
      roomCode: code,
      capabilities: { protocolVersion: 1, dataChannel: true, maxPayloadBytes: 16_384 },
    });
    expect((await rejectedPromise)['code']).toBe('room-not-found');
    host.close();
    guest.close();
  });

  it('rejects unknown and malformed envelopes and closes sockets for oversized or rate-limited data', async () => {
    const server = await start({
      maxPayloadBytes: 256,
      maxMessagesPerWindow: 3,
      messageRateWindowMs: 10_000,
    });
    const invalid = await connect(server.port);
    const invalidResponse = nextMessage(invalid);
    send(invalid, { op: 'not-an-operation', extra: true });
    expect((await invalidResponse)['code']).toBe('invalid-message');
    invalid.close();

    const limited = await connect(server.port);
    const createdPromise = nextMessage(limited);
    send(limited, { op: 'create' });
    await createdPromise;
    const rateClose = waitForClose(limited);
    send(limited, { op: 'unknown' });
    send(limited, { op: 'unknown' });
    send(limited, { op: 'unknown' });
    expect((await rateClose).code).toBe(1008);

    const oversized = await connect(server.port);
    const oversizedClose = waitForClose(oversized);
    oversized.send('x'.repeat(512));
    expect((await oversizedClose).code).toBe(1009);
  });

  it('rejects malformed capabilities and signaling payloads before forwarding', async () => {
    const server = await start();
    const host = await connect(server.port);
    const createPromise = nextMessage(host);
    send(host, { op: 'create' });
    const roomCode = (await createPromise)['roomCode'];
    const guest = await connect(server.port);
    const rejectedPromise = nextMessage(guest);
    send(guest, { op: 'join', roomCode, capabilities: { protocolVersion: 1, surprise: true } });
    expect((await rejectedPromise)['code']).toBe('invalid-message');

    const deniedGuest = await connect(server.port);
    const deniedWaitingPromise = nextMessage(deniedGuest);
    const deniedRequestPromise = nextMessage(host);
    send(deniedGuest, {
      op: 'join',
      roomCode,
      capabilities: { protocolVersion: 1, dataChannel: true, maxPayloadBytes: 16_384 },
    });
    const deniedWaiting = await deniedWaitingPromise;
    await deniedRequestPromise;
    const deniedResponsePromise = nextMessage(deniedGuest);
    send(host, { op: 'approve', peerId: deniedWaiting['peerId'], approved: false });
    expect((await deniedResponsePromise)['op']).toBe('rejected');
    deniedGuest.close();

    const goodGuest = await connect(server.port);
    const waitingPromise = nextMessage(goodGuest);
    const requestPromise = nextMessage(host);
    send(goodGuest, {
      op: 'join',
      roomCode,
      capabilities: { protocolVersion: 1, dataChannel: true, maxPayloadBytes: 16_384 },
    });
    const waiting = await waitingPromise;
    await requestPromise;
    const peerId = waiting['peerId'];
    const approvedPromise = nextMessage(goodGuest);
    send(host, { op: 'approve', peerId, approved: true });
    await approvedPromise;
    const invalidSignalPromise = nextMessage(goodGuest);
    send(goodGuest, {
      op: 'signal',
      to: (await createPromise)['peerId'],
      data: { kind: 'offer', sdp: 'x'.repeat(20_000) },
    });
    expect((await invalidSignalPromise)['code']).toBe('invalid-signal');
    host.close();
    guest.close();
    goodGuest.close();
  });
});
