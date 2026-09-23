import * as THREE from 'three';
import type { MobRecord } from '../gameplay/MobSystem';

const MOB_CAPACITY = 12;

export class MobView {
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly meshes: readonly THREE.InstancedMesh[];
  private readonly mossBodyMaterial = new THREE.MeshLambertMaterial({ color: '#668d49' });
  private readonly mossHeadMaterial = new THREE.MeshLambertMaterial({ color: '#8eaa59' });
  private readonly cinderBodyMaterial = new THREE.MeshLambertMaterial({ color: '#8f4f3e' });
  private readonly cinderHeadMaterial = new THREE.MeshLambertMaterial({ color: '#d0804f' });
  private readonly mossBody: THREE.InstancedMesh;
  private readonly mossHead: THREE.InstancedMesh;
  private readonly cinderBody: THREE.InstancedMesh;
  private readonly cinderHead: THREE.InstancedMesh;
  private readonly transform = new THREE.Object3D();
  private renderedCount = 0;
  private disposed = false;

  constructor(private readonly scene: THREE.Scene) {
    this.mossBody = this.createMesh(this.mossBodyMaterial, 'mob-mossling-body');
    this.mossHead = this.createMesh(this.mossHeadMaterial, 'mob-mossling-head');
    this.cinderBody = this.createMesh(this.cinderBodyMaterial, 'mob-cinder-body');
    this.cinderHead = this.createMesh(this.cinderHeadMaterial, 'mob-cinder-head');
    this.meshes = [this.mossBody, this.mossHead, this.cinderBody, this.cinderHead];
    for (const mesh of this.meshes) this.scene.add(mesh);
  }

  get meshCount(): number {
    return this.meshes.length;
  }

  get renderedMobCount(): number {
    return this.renderedCount;
  }

  update(mobs: readonly MobRecord[], origin: { readonly x: number; readonly z: number }): void {
    if (this.disposed) throw new Error('MobView is disposed');
    if (mobs.length > MOB_CAPACITY) throw new RangeError('Mob view exceeded its fixed capacity');
    const mosslings = mobs.filter((mob) => mob.type === 'mossling');
    const cinders = mobs.filter((mob) => mob.type === 'cinder');
    this.writeType(mosslings, this.mossBody, this.mossHead, origin, 0.68, 0.58, 0.8, 0.55);
    this.writeType(cinders, this.cinderBody, this.cinderHead, origin, 0.78, 0.9, 0.72, 0.65);
    this.renderedCount = mobs.length;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const mesh of this.meshes) this.scene.remove(mesh);
    this.geometry.dispose();
    this.mossBodyMaterial.dispose();
    this.mossHeadMaterial.dispose();
    this.cinderBodyMaterial.dispose();
    this.cinderHeadMaterial.dispose();
    this.renderedCount = 0;
  }

  private createMesh(material: THREE.Material, name: string): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(this.geometry, material, MOB_CAPACITY);
    mesh.name = name;
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return mesh;
  }

  private writeType(
    mobs: readonly MobRecord[],
    body: THREE.InstancedMesh,
    head: THREE.InstancedMesh,
    origin: { readonly x: number; readonly z: number },
    bodyWidth: number,
    bodyHeight: number,
    headWidth: number,
    headHeight: number,
  ): void {
    const offsetX = origin.x * 16;
    const offsetZ = origin.z * 16;
    mobs.forEach((mob, index) => {
      this.transform.position.set(mob.x - offsetX, mob.y + bodyHeight / 2, mob.z - offsetZ);
      this.transform.scale.set(bodyWidth, bodyHeight, bodyWidth);
      this.transform.rotation.set(0, Math.sin(mob.id * 0.7) * 0.08, 0);
      this.transform.updateMatrix();
      body.setMatrixAt(index, this.transform.matrix);

      this.transform.position.set(
        mob.x - offsetX,
        mob.y + bodyHeight + headHeight / 2 - 0.08,
        mob.z - offsetZ,
      );
      this.transform.scale.set(headWidth, headHeight, headWidth);
      this.transform.rotation.set(0, Math.sin(mob.id * 0.7) * 0.08, 0);
      this.transform.updateMatrix();
      head.setMatrixAt(index, this.transform.matrix);
    });
    body.count = mobs.length;
    head.count = mobs.length;
    body.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
  }
}
