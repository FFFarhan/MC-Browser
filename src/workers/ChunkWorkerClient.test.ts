import { describe, expect, it } from 'vitest';
import type { ChunkCoord } from '../shared/coordinates';
import { ChunkWorkerClient, MAX_PENDING_CHUNK_JOBS } from './ChunkWorkerClient';
import type { ChunkWorkerRequest, ChunkWorkerResponse } from './chunkJobs';

class FakeWorker {
  private readonly listeners = new Map<string, Set<EventListener>>();
  readonly requests: ChunkWorkerRequest[] = [];
  terminated = false;

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  postMessage(request: ChunkWorkerRequest): void {
    this.requests.push(request);
  }

  terminate(): void {
    this.terminated = true;
  }

  respond(response: ChunkWorkerResponse): void {
    const event = new MessageEvent('message', { data: response });
    this.listeners.get('message')?.forEach((listener) => listener(event));
  }

  fail(): void {
    this.listeners
      .get('error')
      ?.forEach((listener) => listener(new ErrorEvent('error', { message: 'worker crashed' })));
  }
}

const coord: ChunkCoord = { x: -1, z: 2 };

describe('bounded chunk worker client', () => {
  it('matches region results to the request and resolves prepared chunks', async () => {
    const worker = new FakeWorker();
    const client = new ChunkWorkerClient(worker as unknown as Worker);
    const result = client.prepareRegion('seed', [coord]);
    const request = worker.requests[0];
    expect(request?.kind).toBe('prepare-region');
    if (request?.kind !== 'prepare-region') throw new Error('Expected region job');

    const chunks = [{ coord, blocks: new Uint16Array(0), revision: 0, mesh: {} as never }];
    worker.respond({
      protocolVersion: 1,
      requestId: request.requestId,
      kind: 'prepared-region',
      chunks,
    });

    await expect(result).resolves.toEqual(chunks);
    client.dispose();
    expect(worker.terminated).toBe(true);
  });

  it('rejects saturation and rejects all jobs when the worker crashes', async () => {
    const worker = new FakeWorker();
    const client = new ChunkWorkerClient(worker as unknown as Worker);
    const pending = Array.from({ length: MAX_PENDING_CHUNK_JOBS }, () =>
      client.prepareRegion('seed', [coord]),
    );

    await expect(client.prepareRegion('seed', [coord])).rejects.toThrow('queue is full');
    worker.fail();
    await expect(Promise.all(pending)).rejects.toThrow('worker crashed');
    client.dispose();
  });
});
