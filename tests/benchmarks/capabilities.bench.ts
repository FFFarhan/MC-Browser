import { bench, describe } from 'vitest';
import { evaluateCapabilities, type CapabilityProbe } from '../../src/platform/capabilities';

const supportedProbe: CapabilityProbe = {
  webgl2: true,
  moduleWorkers: true,
  indexedDB: true,
  pointerLock: true,
  transferableArrays: true,
};

describe('capability report benchmark', () => {
  bench('evaluate a complete capability report', () => {
    evaluateCapabilities(supportedProbe);
  });
});
