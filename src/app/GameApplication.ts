import * as THREE from 'three';
import { FixedStepLoop } from '../engine/FixedStepLoop';
import { meshChunk } from '../meshing/faceMesher';
import type { MeshLayer } from '../meshing/mesh-types';
import { ChunkView } from '../rendering/ChunkView';
import { Renderer } from '../rendering/Renderer';
import { createTextureAtlas } from '../rendering/TextureAtlas';
import { createDemoWorld } from '../world/demoWorld';

export class GameApplication {
  readonly renderer: Renderer;
  private readonly loop: FixedStepLoop;
  private readonly shell: HTMLElement;
  private readonly status: HTMLElement;
  private readonly enterButton: HTMLButtonElement;
  private readonly atlas: ReturnType<typeof createTextureAtlas>;
  private readonly materials: Record<MeshLayer, THREE.Material>;
  private readonly previewChunk: ChunkView;
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
    this.renderer.camera.position.set(23, 13, 23);
    this.renderer.camera.lookAt(8, 4, 8);
    const chunk = meshChunk(createDemoWorld(), this.atlas.manifest);
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

    panel.append(eyebrow, title, description, this.enterButton, this.status);
    this.shell.append(viewport, panel);
    this.root.replaceChildren(this.shell);

    this.loop = new FixedStepLoop(() => this.renderer.render());
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
    this.previewChunk.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
    this.atlas.texture.dispose();
    this.renderer.dispose();
    this.shell.remove();
  }

  private readonly enterWorld = (): void => {
    try {
      const request = this.renderer.canvas.requestPointerLock();
      if (request instanceof Promise) {
        void request.catch(() => {
          this.status.textContent =
            'Mouse look is unavailable. You can still explore the viewport.';
        });
      }
    } catch {
      this.status.textContent = 'Mouse look is unavailable. You can still explore the viewport.';
    }
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) this.pause();
    else this.resume();
  };

  private readonly onPointerLockChange = (): void => {
    if (!document.pointerLockElement && !document.hidden && !this.disposed) {
      this.status.textContent = 'Pointer released. Select Enter world to capture the mouse again.';
    }
  };

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
