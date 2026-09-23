import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { CollisionWorld } from '../physics/PlayerCollision';
import { OriginManager } from '../rendering/OriginManager';
import { createPlayerState } from './PlayerState';
import { PlayerController } from './PlayerController';

describe('PlayerController pointer lock', () => {
  it('suspends pointer and keyboard input for a menu without treating unlock as pause', () => {
    const canvas = document.createElement('canvas');
    const onPause = vi.fn();
    const world: CollisionWorld = { collisionAt: () => 'empty' };
    const controller = new PlayerController(
      canvas,
      new THREE.PerspectiveCamera(),
      world,
      createPlayerState({ chunkX: 0, localX: 8, y: 2, chunkZ: 0, localZ: 8 }),
      onPause,
      new OriginManager(),
    );
    const originalDescriptor = Object.getOwnPropertyDescriptor(document, 'pointerLockElement');
    const originalExit = Object.getOwnPropertyDescriptor(document, 'exitPointerLock');
    let locked: Element | null = canvas;

    try {
      Object.defineProperty(document, 'pointerLockElement', {
        configurable: true,
        get: () => locked,
      });
      Object.defineProperty(document, 'exitPointerLock', {
        configurable: true,
        value: vi.fn(() => {
          locked = null;
          document.dispatchEvent(new Event('pointerlockchange'));
        }),
      });
      document.dispatchEvent(new Event('pointerlockchange'));
      controller.suspendControlsForUi();
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', bubbles: true }));
      const mouse = new MouseEvent('mousemove', { bubbles: true, buttons: 1 });
      Object.defineProperty(mouse, 'movementX', { value: 120 });
      canvas.dispatchEvent(mouse);
      controller.update(1 / 60);

      expect(document.exitPointerLock).toHaveBeenCalledOnce();
      expect(controller.getState().yaw).toBe(0);
      expect(controller.getState().position.localX).toBe(8);
      expect(onPause).not.toHaveBeenCalled();
    } finally {
      controller.dispose();
      if (originalDescriptor)
        Object.defineProperty(document, 'pointerLockElement', originalDescriptor);
      else Reflect.deleteProperty(document, 'pointerLockElement');
      if (originalExit) Object.defineProperty(document, 'exitPointerLock', originalExit);
      else Reflect.deleteProperty(document, 'exitPointerLock');
    }
  });

  it('does not treat a programmatic unlock during pause as a second user pause', () => {
    const canvas = document.createElement('canvas');
    const onPause = vi.fn();
    const world: CollisionWorld = { collisionAt: () => 'empty' };
    const controller = new PlayerController(
      canvas,
      new THREE.PerspectiveCamera(),
      world,
      createPlayerState({ chunkX: 0, localX: 8, y: 2, chunkZ: 0, localZ: 8 }),
      onPause,
      new OriginManager(),
    );
    const originalDescriptor = Object.getOwnPropertyDescriptor(document, 'pointerLockElement');

    try {
      Object.defineProperty(document, 'pointerLockElement', {
        configurable: true,
        value: canvas,
      });
      document.dispatchEvent(new Event('pointerlockchange'));
      expect(onPause).not.toHaveBeenCalled();

      controller.deactivateControls();
      Object.defineProperty(document, 'pointerLockElement', {
        configurable: true,
        value: null,
      });
      document.dispatchEvent(new Event('pointerlockchange'));

      expect(onPause).not.toHaveBeenCalled();
    } finally {
      controller.dispose();
      if (originalDescriptor)
        Object.defineProperty(document, 'pointerLockElement', originalDescriptor);
      else Reflect.deleteProperty(document, 'pointerLockElement');
    }
  });
});
