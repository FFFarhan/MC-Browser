import * as THREE from 'three';
import { FixedStepLoop } from '../engine/FixedStepLoop';
import { meshChunk } from '../meshing/faceMesher';
import type { MeshLayer } from '../meshing/mesh-types';
import { ChunkView } from '../rendering/ChunkView';
import { OriginManager } from '../rendering/OriginManager';
import { Renderer } from '../rendering/Renderer';
import { createTextureAtlas } from '../rendering/TextureAtlas';
import { createDemoCollisionWorld, createDemoWorld } from '../world/demoWorld';
import { findSafeSpawn } from '../physics/PlayerCollision';
import { DEFAULT_PLAYER_COLLIDER } from '../player/PlayerState';
import { PlayerController } from '../player/PlayerController';
import { createControlsOverlay } from '../ui/ControlsOverlay';

export class GameApplication {
  readonly renderer: Renderer;
  private readonly loop: FixedStepLoop;
  private readonly shell: HTMLElement;
  private readonly status: HTMLElement;
  private readonly enterButton: HTMLButtonElement;
  private readonly atlas: ReturnType<typeof createTextureAtlas>;
  private readonly materials: Record<MeshLayer, THREE.Material>;
  private readonly previewChunk: ChunkView;
  private readonly player: PlayerController;
  private readonly controls: HTMLElement;
  private sessionStarted = false;
  private disposed = false;

  constructor(private readonly root: HTMLElement) {
    this.shell = document.createElement('main');
    this.shell.className = 'game-shell';
    this.shell.dataset['state'] = 'ready';

    const viewport = document.createElement('div');
    viewport.className = 'game-viewport';
    this.renderer = new Renderer(viewport);
    this.atlas = createTextureAtlas('stonefield-preview-v1');
    this.materials = {
      opaque: new THREE.MeshLambertMaterial({ map: this.atlas.texture }),
      cutout: new THREE.MeshLambertMaterial({ map: this.atlas.texture, alphaTest: 0.48 }),
      translucent: new THREE.MeshLambertMaterial({
        map: this.atlas.texture,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    };
    this.previewChunk = new ChunkView(this.renderer.scene, this.materials);
    this.renderer.scene.fog = new THREE.Fog('#9bb9bb', 28, 92);
    this.renderer.scene.add(new THREE.HemisphereLight('#e5f0db', '#554d3b', 2.1));
    const sun = new THREE.DirectionalLight('#fff0cb', 2.4);
    sun.position.set(-18, 32, 12);
    this.renderer.scene.add(sun);
    const chunkSnapshot = createDemoWorld();
    const collisionWorld = createDemoCollisionWorld(chunkSnapshot);
    this.renderer.camera.lookAt(8, 5, 8);
    const spawn = findSafeSpawn(8, 14, 32, DEFAULT_PLAYER_COLLIDER, collisionWorld);
    this.player = new PlayerController(
      this.renderer.canvas,
      this.renderer.camera,
      collisionWorld,
      {
        position: spawn,
        velocity: { x: 0, y: 0, z: 0 },
        yaw: 0,
        pitch: 0,
        grounded: false,
        crouching: false,
        jumpWasDown: false,
      },
      this.pauseGame,
      new OriginManager(4),
    );
    const chunk = meshChunk(chunkSnapshot, this.atlas.manifest);
    for (const layer of ['opaque', 'cutout', 'translucent'] as const)
      this.previewChunk.update(layer, chunk[layer]);
    this.renderer.render();

    const panel = document.createElement('section');
    panel.className = 'welcome-panel';
    panel.setAttribute('aria-labelledby', 'game-title');

    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = 'A world waiting to be shaped';

    const title = document.createElement('h1');
    title.id = 'game-title';
    title.textContent = 'Stonefield';

    const description = document.createElement('p');
    description.className = 'welcome-copy';
    description.textContent = 'Gather, build, and find your way through a quiet wild world.';

    this.enterButton = document.createElement('button');
    this.enterButton.type = 'button';
    this.enterButton.className = 'primary-button';
    this.enterButton.textContent = 'Enter world';
    this.enterButton.addEventListener('click', this.enterWorld);

    this.status = document.createElement('p');
    this.status.className = 'status-line';
    this.status.setAttribute('role', 'status');
    this.status.textContent = 'Game engine ready';
    this.controls = createControlsOverlay();

    panel.append(eyebrow, title, description, this.enterButton, this.status);
    this.shell.append(viewport, panel, this.controls);
    this.root.replaceChildren(this.shell);

    this.loop = new FixedStepLoop((dt) => {
      this.player.update(dt);
      this.updatePlayerStatus();
      this.renderer.render();
    });
    this.loop.start();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    this.renderer.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  pause(): void {
    this.loop.pause();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  resume(): void {
    this.loop.resume();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pause();
    this.loop.dispose();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.renderer.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.enterButton.removeEventListener('click', this.enterWorld);
    this.player.dispose();
    this.previewChunk.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
    this.atlas.texture.dispose();
    this.renderer.dispose();
    this.shell.remove();
  }

  private readonly enterWorld = (): void => {
    try {
      this.sessionStarted = true;
      this.renderer.canvas.focus();
      const request = this.renderer.canvas.requestPointerLock();
      if (request instanceof Promise) {
        void request.catch(() => {
          this.player.activateFallbackControls();
          this.resume();
          this.status.textContent = 'Keyboard mode active. WASD moves; click and drag to look.';
        });
      }
    } catch {
      this.player.activateFallbackControls();
      this.resume();
      this.status.textContent = 'Keyboard mode active. WASD moves; click and drag to look.';
    }
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) this.pause();
    else this.resume();
  };

  private readonly onPointerLockChange = (): void => {
    if (document.pointerLockElement === this.renderer.canvas) {
      this.enterButton.textContent = 'Resume world';
      this.status.textContent = 'Mouse captured. WASD to move, mouse to look.';
      this.resume();
    } else if (this.sessionStarted && !document.hidden && !this.disposed) {
      this.pauseGame();
    }
  };

  private readonly pauseGame = (): void => {
    if (this.disposed) return;
    this.player.deactivateControls();
    this.pause();
    this.enterButton.textContent = 'Resume world';
    this.status.textContent = 'Paused. Select Resume world to continue.';
  };

  private lastStatusCell = '';

  private updatePlayerStatus(): void {
    const position = this.player.getState().position;
    const cell = `${position.chunkX * 16 + Math.floor(position.localX)},${Math.floor(position.y)},${position.chunkZ * 16 + Math.floor(position.localZ)}`;
    if (cell === this.lastStatusCell && this.status.textContent?.startsWith('Exploring')) return;
    this.lastStatusCell = cell;
    if (this.sessionStarted) this.status.textContent = `Exploring · ${cell}`;
  }

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.pause();
    this.status.textContent = 'Graphics paused while the browser restores the display.';
  };

  private readonly onContextRestored = (): void => {
    this.status.textContent = 'Graphics restored. Select Enter world to continue.';
    this.renderer.render();
  };
}
