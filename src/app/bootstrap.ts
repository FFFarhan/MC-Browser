import { GameError, renderFatalError, renderUnsupportedScreen } from './errors';
import { detectCapabilities, type CapabilityReport } from '../platform/capabilities';
import type { GameApplication } from './GameApplication';

export async function startApplication(root: HTMLElement): Promise<GameApplication | null> {
  const capabilityReport: CapabilityReport = detectCapabilities();
  if (!capabilityReport.supported) {
    renderUnsupportedScreen(root, capabilityReport);
    return null;
  }

  try {
    const { GameApplication } = await import('./GameApplication');
    return new GameApplication(root);
  } catch (cause) {
    const error = new GameError('STARTUP_FAILED', 'The game could not start.', { cause });
    renderFatalError(root, error);
    return null;
  }
}
