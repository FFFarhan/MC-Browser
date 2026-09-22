import { describe, expect, it } from 'vitest';
import { GameError, renderFatalError } from './errors';

describe('fatal error recovery', () => {
  it('keeps the startup cause available in a technical-details disclosure', () => {
    const root = document.createElement('main');
    const error = new GameError('STARTUP_FAILED', 'The game could not start.', {
      cause: new Error('WebGL context initialization failed.'),
    });

    renderFatalError(root, error);

    const details = root.querySelector('details');
    expect(details).not.toBeNull();
    expect(details?.textContent ?? '').toContain('WebGL context initialization failed.');
  });
});
