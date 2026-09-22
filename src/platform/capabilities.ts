export interface CapabilityProbe {
  readonly webgl2: boolean;
  readonly moduleWorkers: boolean;
  readonly indexedDB: boolean;
  readonly pointerLock: boolean;
  readonly transferableArrays: boolean;
}

export interface CapabilityReport {
  readonly supported: boolean;
  readonly missing: readonly string[];
}

const capabilityLabels: ReadonlyArray<readonly [keyof CapabilityProbe, string]> = [
  ['webgl2', 'WebGL 2 rendering'],
  ['moduleWorkers', 'module Web Workers'],
  ['indexedDB', 'IndexedDB local saves'],
  ['pointerLock', 'Pointer Lock for mouse look'],
  ['transferableArrays', 'transferable typed arrays'],
];

export function evaluateCapabilities(probe: CapabilityProbe): CapabilityReport {
  const missing = capabilityLabels
    .filter(([capability]) => !probe[capability])
    .map(([, label]) => label);

  return { supported: missing.length === 0, missing };
}

export function detectCapabilities(): CapabilityReport {
  const canvas = document.createElement('canvas');
  const webgl2 = (() => {
    try {
      return canvas.getContext('webgl2') !== null;
    } catch {
      return false;
    }
  })();

  return evaluateCapabilities({
    webgl2,
    moduleWorkers: typeof Worker !== 'undefined',
    indexedDB: typeof indexedDB !== 'undefined',
    pointerLock: typeof document.documentElement.requestPointerLock === 'function',
    transferableArrays:
      typeof structuredClone === 'function' && typeof MessageChannel !== 'undefined',
  });
}
