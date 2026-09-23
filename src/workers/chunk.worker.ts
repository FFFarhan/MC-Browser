/// <reference lib="webworker" />

import {
  handleChunkWorkerJob,
  type ChunkWorkerRequest,
  type ChunkWorkerResponse,
} from './chunkJobs';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

function responseTransferables(response: ChunkWorkerResponse): Transferable[] {
  const transfer: Transferable[] = [];
  const add = (view: ArrayBufferView): void => {
    if (view.buffer instanceof ArrayBuffer) transfer.push(view.buffer);
  };
  if (response.kind === 'prepared-region') {
    for (const chunk of response.chunks) {
      add(chunk.blocks);
      for (const layer of Object.values(chunk.mesh)) {
        add(layer.positions);
        add(layer.normals);
        add(layer.uvs);
        add(layer.indices);
        add(layer.light);
      }
    }
  } else if (response.kind === 'remeshed-chunk') {
    for (const layer of Object.values(response.mesh)) {
      add(layer.positions);
      add(layer.normals);
      add(layer.uvs);
      add(layer.indices);
      add(layer.light);
    }
  }
  return transfer;
}

workerScope.addEventListener('message', (event: MessageEvent<ChunkWorkerRequest>) => {
  let response: ChunkWorkerResponse;
  try {
    response = handleChunkWorkerJob(event.data);
  } catch (error) {
    response = {
      protocolVersion: 1,
      requestId: Number.isSafeInteger(event.data?.requestId) ? event.data.requestId : -1,
      kind: 'chunk-worker-error',
      message: error instanceof Error ? error.message : 'Chunk job failed.',
    };
  }
  workerScope.postMessage(response, responseTransferables(response));
});
