import { describe, expect, it } from 'vitest';
import { evaluateCapabilities, type CapabilityProbe } from './capabilities';
import { renderUnsupportedScreen } from '../app/errors';

describe('browser capabilities', () => {
  it('shows an accessible recovery screen when WebGL 2 is missing', () => {
    const probe: CapabilityProbe = {
      webgl2: false,
      moduleWorkers: true,
      indexedDB: true,
      pointerLock: true,
      transferableArrays: true,
    };
    const report = evaluateCapabilities(probe);
    const root = document.createElement('main');

    renderUnsupportedScreen(root, report);

    expect(report.supported).toBe(false);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('WebGL 2');
    expect(root.querySelector('h1')?.textContent).toBe('This browser cannot run Stonefield');
  });

  it('accepts a browser with every required capability', () => {
    const probe: CapabilityProbe = {
      webgl2: true,
      moduleWorkers: true,
      indexedDB: true,
      pointerLock: true,
      transferableArrays: true,
    };

    expect(evaluateCapabilities(probe)).toEqual({ supported: true, missing: [] });
  });
});
