import type { ChunkMeshSnapshot } from '../meshing/mesh-types';
import type { ChunkCoord } from '../shared/coordinates';
import type { ChunkMeshBuffers } from '../meshing/mesh-types';
import type { PreparedChunk, ChunkWorkerRequest, ChunkWorkerResponse } from './chunkJobs';

export const MAX_PENDING_CHUNK_JOBS = 4;

interface PendingJob {
  readonly expected: 'prepared-region' | 'remeshed-chunk';
  readonly resolve: (response: ChunkWorkerResponse) => void;
  readonly reject: (error: Error) => void;
}

export interface RemeshedChunk {
  readonly coord: ChunkCoord;
  readonly revision: number;
  readonly mesh: ChunkMeshBuffers;
}

export class ChunkWorkerClient {
  private readonly pending = new Map<number, PendingJob>();
  private nextRequestId = 0;
  private disposed = false;
  private failed: Error | null = null;

  constructor(private readonly worker: Worker) {
    worker.addEventListener('message', this.onMessage as EventListener);
    worker.addEventListener('error', this.onError as EventListener);
    worker.addEventListener('messageerror', this.onMessageError as EventListener);
  }

  prepareRegion(
    seed: number | string,
    coords: readonly ChunkCoord[],
  ): Promise<readonly PreparedChunk[]> {
    return this.send(
      (requestId) => ({
        protocolVersion: 1,
        requestId,
        kind: 'prepare-region',
        seed,
        coords: coords.map((coord) => ({ ...coord })),
      }),
      'prepared-region',
    ).then((response) => {
      if (response.kind !== 'prepared-region') throw new Error('Unexpected worker response');
      return response.chunks;
    });
  }

  rebuildChunk(snapshot: ChunkMeshSnapshot): Promise<RemeshedChunk> {
    return this.send(
      (requestId) => ({
        protocolVersion: 1,
        requestId,
        kind: 'rebuild-chunk',
        snapshot: {
          coord: { ...snapshot.coord },
          blocks: snapshot.blocks,
          revision: snapshot.revision,
          neighbors: { ...snapshot.neighbors },
        },
      }),
      'remeshed-chunk',
    ).then((response) => {
      if (response.kind !== 'remeshed-chunk') throw new Error('Unexpected worker response');
      return response;
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.removeEventListener('message', this.onMessage as EventListener);
    this.worker.removeEventListener('error', this.onError as EventListener);
    this.worker.removeEventListener('messageerror', this.onMessageError as EventListener);
    this.worker.terminate();
    this.rejectPending(new Error('Chunk worker client was disposed'));
  }

  private send(
    createRequest: (requestId: number) => ChunkWorkerRequest,
    expected: PendingJob['expected'],
  ): Promise<ChunkWorkerResponse> {
    if (this.disposed) return Promise.reject(new Error('Chunk worker client is disposed'));
    if (this.failed) return Promise.reject(this.failed);
    if (this.pending.size >= MAX_PENDING_CHUNK_JOBS)
      return Promise.reject(new Error('Chunk worker queue is full'));
    if (this.nextRequestId >= Number.MAX_SAFE_INTEGER)
      return Promise.reject(new Error('Chunk worker request ID space is exhausted'));
    const requestId = this.nextRequestId++;
    const request = createRequest(requestId);
    return new Promise<ChunkWorkerResponse>((resolve, reject) => {
      this.pending.set(requestId, { expected, resolve, reject });
      try {
        this.worker.postMessage(request);
      } catch (error) {
        this.pending.delete(requestId);
        reject(error instanceof Error ? error : new Error('Could not send chunk worker job'));
      }
    });
  }

  private readonly onMessage = (event: MessageEvent<ChunkWorkerResponse>): void => {
    const response = event.data;
    if (!response || response.protocolVersion !== 1 || !Number.isSafeInteger(response.requestId))
      return;
    const pending = this.pending.get(response.requestId);
    if (!pending) return;
    this.pending.delete(response.requestId);
    if (response.kind === 'chunk-worker-error') {
      pending.reject(new Error(response.message));
      return;
    }
    if (response.kind !== pending.expected) {
      pending.reject(new Error('Chunk worker returned an incompatible response'));
      return;
    }
    pending.resolve(response);
  };

  private readonly onError = (event: ErrorEvent): void => {
    this.failed = new Error(event.message || 'Chunk worker crashed');
    this.rejectPending(this.failed);
  };

  private readonly onMessageError = (): void => {
    this.failed = new Error('Chunk worker sent data that could not be decoded');
    this.rejectPending(this.failed);
  };

  private rejectPending(error: Error): void {
    for (const job of this.pending.values()) job.reject(error);
    this.pending.clear();
  }
}
