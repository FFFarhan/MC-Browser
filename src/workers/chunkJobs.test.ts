import { describe, expect, it } from 'vitest';
import { handleChunkWorkerJob } from './chunkJobs';

describe('worker chunk preparation', () => {
  it('generates and meshes neighboring negative-coordinate chunks with border halos', () => {
    const request = {
      protocolVersion: 1 as const,
      requestId: 7,
      kind: 'prepare-region' as const,
      seed: 'quiet-valley',
      coords: [
        { x: -1, z: 0 },
        { x: 0, z: 0 },
      ],
    };
    const region = handleChunkWorkerJob(request);
    const standalone = handleChunkWorkerJob({
      ...request,
      requestId: 8,
      coords: [{ x: -1, z: 0 }],
    });

    expect(region.kind).toBe('prepared-region');
    if (region.kind !== 'prepared-region' || standalone.kind !== 'prepared-region') {
      throw new Error('Expected prepared chunk data');
    }
    expect(region.chunks.map((chunk) => chunk.coord)).toEqual([
      { x: -1, z: 0 },
      { x: 0, z: 0 },
    ]);
    expect(region.chunks[0]?.blocks).toEqual(standalone.chunks[0]?.blocks);
    expect(region.chunks[0]?.mesh.opaque.positions.length).toBeLessThan(
      standalone.chunks[0]?.mesh.opaque.positions.length ?? 0,
    );
  });

  it('rejects empty, duplicate, and oversized chunk regions', () => {
    const base = {
      protocolVersion: 1 as const,
      requestId: 1,
      kind: 'prepare-region' as const,
      seed: 'quiet-valley',
    };

    expect(() => handleChunkWorkerJob({ ...base, coords: [] })).toThrow(RangeError);
    expect(() =>
      handleChunkWorkerJob({
        ...base,
        coords: [
          { x: 0, z: 0 },
          { x: 0, z: 0 },
        ],
      }),
    ).toThrow(RangeError);
    expect(() =>
      handleChunkWorkerJob({
        ...base,
        coords: Array.from({ length: 50 }, (_, index) => ({ x: index, z: 0 })),
      }),
    ).toThrow(RangeError);
  });
});
