import * as THREE from 'three';
import type { MeshBuffers, MeshLayer } from '../meshing/mesh-types';

export class ChunkView {
  private readonly meshes = new Map<MeshLayer, THREE.Mesh<THREE.BufferGeometry, THREE.Material>>();
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly materials: Readonly<Record<MeshLayer, THREE.Material>>,
  ) {}

  getMesh(layer: MeshLayer): THREE.Mesh<THREE.BufferGeometry, THREE.Material> | null {
    return this.meshes.get(layer) ?? null;
  }

  update(layer: MeshLayer, buffers: MeshBuffers): void {
    if (this.disposed) throw new Error('ChunkView is disposed');
    validateBuffers(buffers);
    const previous = this.meshes.get(layer);
    if (buffers.positions.length === 0) {
      if (previous) {
        this.scene.remove(previous);
        previous.geometry.dispose();
        this.meshes.delete(layer);
      }
      return;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(buffers.normals, 3, true));
    geometry.setAttribute('uv', new THREE.BufferAttribute(buffers.uvs, 2));
    geometry.setAttribute('light', new THREE.BufferAttribute(buffers.light, 1, true));
    geometry.setIndex(new THREE.BufferAttribute(buffers.indices, 1));
    geometry.computeBoundingSphere();
    if (previous) {
      this.scene.remove(previous);
      previous.geometry.dispose();
    }
    const mesh = new THREE.Mesh(geometry, this.materials[layer]);
    mesh.frustumCulled = true;
    mesh.name = `chunk-layer-${layer}`;
    this.meshes.set(layer, mesh);
    this.scene.add(mesh);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.meshes.clear();
  }
}

function validateBuffers(buffers: MeshBuffers): void {
  const vertices = buffers.positions.length / 3;
  if (
    !Number.isInteger(vertices) ||
    buffers.normals.length !== vertices * 3 ||
    buffers.uvs.length !== vertices * 2 ||
    buffers.light.length !== vertices
  ) {
    throw new RangeError('Mesh attribute buffers have inconsistent lengths');
  }
  if (buffers.indices.length % 3 !== 0)
    throw new RangeError('Mesh index buffer must contain triangles');
  for (const index of buffers.indices)
    if (index >= vertices)
      throw new RangeError(`Mesh index ${index} is outside ${vertices} vertices`);
}
