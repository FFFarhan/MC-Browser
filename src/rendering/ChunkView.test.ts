import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ChunkView } from './ChunkView';
import type { MeshBuffers, MeshLayer } from '../meshing/mesh-types';

function materials(): Record<MeshLayer, THREE.Material> {
  return {
    opaque: new THREE.MeshBasicMaterial(),
    cutout: new THREE.MeshBasicMaterial(),
    translucent: new THREE.MeshBasicMaterial(),
  };
}

function triangle(): MeshBuffers {
  return {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Int8Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
    indices: new Uint16Array([0, 1, 2]),
    light: new Uint8Array([255, 255, 255]),
  };
}

describe('ChunkView', () => {
  it('disposes replaced geometry and removes resources without disposing shared materials', () => {
    const scene = new THREE.Scene();
    const shared = materials();
    const view = new ChunkView(scene, shared);
    const first = triangle();
    view.update('opaque', first);
    const mesh = view.getMesh('opaque');
    if (!mesh) throw new Error('Expected the opaque mesh');
    const oldGeometry = mesh.geometry;
    const geometryDisposed = vi.fn();
    const materialDisposed = vi.fn();
    oldGeometry.addEventListener('dispose', geometryDisposed);
    shared.opaque.addEventListener('dispose', materialDisposed);

    view.update('opaque', triangle());
    expect(geometryDisposed).toHaveBeenCalledTimes(1);
    expect(view.getMesh('opaque')?.geometry).not.toBe(oldGeometry);
    for (let i = 0; i < 99; i += 1) {
      const current = view.getMesh('opaque');
      if (!current) throw new Error('Expected the current opaque mesh');
      current.geometry.addEventListener('dispose', geometryDisposed);
      view.update('opaque', triangle());
      expect(scene.children).toHaveLength(1);
    }
    expect(geometryDisposed).toHaveBeenCalledTimes(100);
    view.dispose();
    expect(scene.children).toHaveLength(0);
    expect(materialDisposed).not.toHaveBeenCalled();
  });

  it('removes an empty layer and rejects mismatched or out-of-range buffers', () => {
    const scene = new THREE.Scene();
    const view = new ChunkView(scene, materials());
    view.update('opaque', triangle());
    view.update('opaque', {
      positions: new Float32Array(),
      normals: new Int8Array(),
      uvs: new Float32Array(),
      indices: new Uint16Array(),
      light: new Uint8Array(),
    });

    expect(view.getMesh('opaque')).toBeNull();
    expect(() => view.update('cutout', { ...triangle(), uvs: new Float32Array([0]) })).toThrow(
      RangeError,
    );
    expect(() =>
      view.update('cutout', { ...triangle(), indices: new Uint16Array([0, 1, 9]) }),
    ).toThrow(RangeError);
    view.dispose();
  });

  it('positions each chunk mesh at its world-space horizontal offset', () => {
    const view = new ChunkView(new THREE.Scene(), materials());
    view.setChunkOffset(32, -16);
    view.update('opaque', triangle());

    expect(view.getMesh('opaque')?.position.x).toBe(32);
    expect(view.getMesh('opaque')?.position.z).toBe(-16);
    view.dispose();
  });
});
