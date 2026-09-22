import { describe, expect, it } from 'vitest';
import { traceVoxels } from './VoxelRaycast';

describe('voxel-grid ray traversal', () => {
  it('finds an axis-aligned target and reports the adjacent placement cell', () => {
    const hit = traceVoxels({ x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, 5, (x, y, z) =>
      x === 3 && y === 0 && z === 0 ? 7 : 0,
    );
    expect(hit).toMatchObject({
      block: { x: 3, y: 0, z: 0, id: 7 },
      previous: { x: 2, y: 0, z: 0 },
      distance: 2.5,
    });
  });
  it('uses deterministic X-first traversal when a ray crosses a voxel corner', () => {
    const hit = traceVoxels({ x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 1 }, 5, (x, y, z) =>
      x === 1 && y === 0 && z === 0 ? 2 : 0,
    );
    expect(hit?.block).toEqual({ x: 1, y: 0, z: 0, id: 2 });
  });
  it('respects reach and treats unloaded cells as a hard stop', () => {
    expect(
      traceVoxels({ x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, 5, (x) => (x === 7 ? 1 : 0)),
    ).toBeNull();
    expect(
      traceVoxels({ x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, 10, (x) => (x >= 2 ? null : 0)),
    ).toBeNull();
  });
});
