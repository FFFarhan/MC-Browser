import * as THREE from 'three';

export class Renderer {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.1, 512);
  readonly canvas: HTMLCanvasElement;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly resizeObserver: ResizeObserver | null;
  private disposed = false;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(new THREE.Color('#8eb8c8'), 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute('aria-label', 'Stonefield game viewport');
    this.canvas.dataset['testid'] = 'game-canvas';
    this.container.append(this.canvas);
    this.resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.resize());
    this.resizeObserver?.observe(container);
    window.addEventListener('resize', this.onWindowResize);
    this.resize();
  }

  render(): void {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.onWindowResize);
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  private readonly onWindowResize = (): void => this.resize();

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
}
