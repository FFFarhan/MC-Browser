import * as THREE from 'three';
import type { NetworkPose } from '../network/protocol';

const REMOTE_PLAYER_CAPACITY = 3;

export interface RemotePlayerRecord {
  readonly peerId: string;
  readonly pose: NetworkPose;
}

export class RemotePlayerView {
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly bodyMaterial = new THREE.MeshLambertMaterial({ color: '#4d8291' });
  private readonly headMaterial = new THREE.MeshLambertMaterial({ color: '#d5ae87' });
  private readonly body: THREE.InstancedMesh;
  private readonly head: THREE.InstancedMesh;
  private readonly transform = new THREE.Object3D();
  private disposed = false;

  constructor(private readonly scene: THREE.Scene) {
    this.body = this.createMesh(this.bodyMaterial, 'remote-player-body');
    this.head = this.createMesh(this.headMaterial, 'remote-player-head');
    this.scene.add(this.body, this.head);
  }

  get meshCount(): number {
    return 2;
  }

  get renderedPlayerCount(): number {
    return this.body.count;
  }

  update(
    players: readonly RemotePlayerRecord[],
    origin: { readonly x: number; readonly z: number },
  ): void {
    if (this.disposed) throw new Error('RemotePlayerView is disposed');
    if (players.length > REMOTE_PLAYER_CAPACITY)
      throw new RangeError('Remote player view exceeded its four-player capacity');
    const offsetX = origin.x * 16;
    const offsetZ = origin.z * 16;
    players.forEach(({ pose }, index) => {
      this.transform.position.set(pose.x - offsetX, pose.y + 0.85, pose.z - offsetZ);
      this.transform.scale.set(0.55, 1.35, 0.4);
      this.transform.rotation.set(0, pose.yaw, 0);
      this.transform.updateMatrix();
      this.body.setMatrixAt(index, this.transform.matrix);

      this.transform.position.set(pose.x - offsetX, pose.y + 1.68, pose.z - offsetZ);
      this.transform.scale.set(0.44, 0.44, 0.44);
      this.transform.rotation.set(0, pose.yaw, 0);
      this.transform.updateMatrix();
      this.head.setMatrixAt(index, this.transform.matrix);
    });
    this.body.count = players.length;
    this.head.count = players.length;
    this.body.instanceMatrix.needsUpdate = true;
    this.head.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.remove(this.body, this.head);
    this.geometry.dispose();
    this.bodyMaterial.dispose();
    this.headMaterial.dispose();
  }

  private createMesh(material: THREE.Material, name: string): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(this.geometry, material, REMOTE_PLAYER_CAPACITY);
    mesh.name = name;
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return mesh;
  }
}
