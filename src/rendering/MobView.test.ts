import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { MobView } from './MobView';
import type { MobRecord } from '../gameplay/MobSystem';

describe('instanced mob rendering', () => {
  it('reuses a bounded set of meshes and disposes its shared resources', () => {
    const scene = new THREE.Scene();
    const view = new MobView(scene);
    const baseSceneObjects = scene.children.length;
    const disposeSpy = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const mobs: MobRecord[] = Array.from({ length: 10 }, (_, index) => ({
      id: index + 1,
      type: index % 2 === 0 ? 'mossling' : 'cinder',
      x: index,
      y: 4,
      z: -index,
      health: 8,
      maxHealth: 8,
      attackCooldown: 0,
    }));
    try {
      for (let update = 0; update < 20; update += 1) view.update(mobs, { x: 0, z: 0 });
      expect(scene.children.length).toBe(baseSceneObjects);
      expect(view.meshCount).toBe(4);
      expect(view.renderedMobCount).toBe(10);
      view.dispose();
      expect(scene.children).toHaveLength(0);
      expect(disposeSpy).toHaveBeenCalled();
    } finally {
      disposeSpy.mockRestore();
    }
  });
});
