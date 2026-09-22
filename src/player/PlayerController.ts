import type * as THREE from 'three';
import { OriginManager } from '../rendering/OriginManager';
import type { CollisionWorld } from '../physics/PlayerCollision';
import { stepPlayer, type PlayerInput, type PlayerState } from './PlayerState';

const MOUSE_RADIANS_PER_PIXEL = 0.0022;
const MAX_MOUSE_DELTA_PER_TICK = 1_000;

export class PlayerController {
  private state: PlayerState;
  private readonly keys = new Set<string>();
  private pointerLocked = false;
  private controlsActive = false;
  private mouseX = 0;
  private mouseY = 0;
  private disposed = false;
  private readonly onPause: () => void;
  private readonly origin: OriginManager;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly world: CollisionWorld,
    spawn: PlayerState,
    onPause: () => void,
    origin = new OriginManager(),
  ) {
    this.state = spawn;
    this.onPause = onPause;
    this.origin = origin;
    this.camera.rotation.order = 'YXZ';
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    this.canvas.tabIndex = 0;
    this.applyCamera();
  }

  getState(): PlayerState {
    return this.state;
  }

  activateFallbackControls(): void {
    if (this.disposed) return;
    this.controlsActive = true;
    this.canvas.focus();
  }

  deactivateControls(): void {
    this.controlsActive = false;
    this.keys.clear();
    this.mouseX = 0;
    this.mouseY = 0;
  }

  update(dt: number): void {
    if (this.disposed || !this.controlsActive) return;
    const lookX =
      Math.max(-MAX_MOUSE_DELTA_PER_TICK, Math.min(MAX_MOUSE_DELTA_PER_TICK, this.mouseX)) *
      MOUSE_RADIANS_PER_PIXEL;
    const lookY =
      Math.max(-MAX_MOUSE_DELTA_PER_TICK, Math.min(MAX_MOUSE_DELTA_PER_TICK, this.mouseY)) *
      MOUSE_RADIANS_PER_PIXEL;
    this.mouseX = 0;
    this.mouseY = 0;
    const input: PlayerInput = {
      forward: this.keys.has('KeyW'),
      backward: this.keys.has('KeyS'),
      left: this.keys.has('KeyA'),
      right: this.keys.has('KeyD'),
      jump: this.keys.has('Space'),
      sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      crouch: this.keys.has('KeyC'),
      lookX,
      lookY,
    };
    this.state = stepPlayer(this.state, input, this.world, dt);
    this.origin.rebaseIfNeeded({ x: this.state.position.chunkX, z: this.state.position.chunkZ });
    this.applyCamera();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.keys.clear();
  }

  private applyCamera(): void {
    const position = this.origin.toRenderPosition({
      chunkX: this.state.position.chunkX,
      chunkZ: this.state.position.chunkZ,
      localX: this.state.position.localX,
      localZ: this.state.position.localZ,
      y: this.state.position.y + (this.state.crouching ? 1.35 : 1.62),
    });
    this.camera.position.set(position.x, position.y, position.z);
    this.camera.rotation.y = this.state.yaw;
    this.camera.rotation.x = this.state.pitch;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.controlsActive) return;
    if (event.code === 'Escape' && this.controlsActive) {
      event.preventDefault();
      this.onPause();
      return;
    }
    if (
      ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyC'].includes(
        event.code,
      )
    ) {
      event.preventDefault();
    }
    this.keys.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (this.pointerLocked) {
      this.mouseX += event.movementX;
      this.mouseY += event.movementY;
    } else if (this.controlsActive && event.buttons === 1) {
      this.mouseX += event.movementX;
      this.mouseY += event.movementY;
    }
  };

  private readonly onPointerLockChange = (): void => {
    const wasLocked = this.pointerLocked;
    this.pointerLocked = document.pointerLockElement === this.canvas;
    this.controlsActive = this.pointerLocked;
    if (!this.pointerLocked) {
      this.keys.clear();
      this.mouseX = 0;
      this.mouseY = 0;
      if (wasLocked) this.onPause();
    }
  };
}
