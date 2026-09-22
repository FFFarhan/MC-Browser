import type { CapabilityReport } from '../platform/capabilities';

export type GameErrorCode =
  'UNSUPPORTED_BROWSER' | 'STARTUP_FAILED' | 'RENDERER_FAILED' | 'INVARIANT_FAILED';

export class GameError extends Error {
  constructor(
    readonly code: GameErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GameError';
  }
}

export function renderUnsupportedScreen(root: HTMLElement, report: CapabilityReport): void {
  const section = document.createElement('section');
  section.className = 'recovery-card';
  section.setAttribute('role', 'alert');
  section.setAttribute('aria-labelledby', 'recovery-title');

  const heading = document.createElement('h1');
  heading.id = 'recovery-title';
  heading.textContent = 'This browser cannot run Stonefield';

  const explanation = document.createElement('p');
  explanation.textContent = 'Stonefield needs these browser features to run:';

  const list = document.createElement('ul');
  for (const missing of report.missing) {
    const item = document.createElement('li');
    item.textContent = missing;
    list.append(item);
  }

  const recovery = document.createElement('p');
  recovery.textContent = 'Try a current desktop version of Chrome, Firefox, or Safari.';

  section.append(heading, explanation, list, recovery);
  root.replaceChildren(section);
}

export function renderFatalError(root: HTMLElement, error: unknown): void {
  const section = document.createElement('section');
  section.className = 'recovery-card';
  section.setAttribute('role', 'alert');

  const heading = document.createElement('h1');
  heading.textContent = 'Stonefield paused to protect your world';

  const message = document.createElement('p');
  message.textContent = error instanceof Error ? error.message : 'An unexpected error occurred.';

  const reload = document.createElement('button');
  reload.type = 'button';
  reload.textContent = 'Reload game';
  reload.addEventListener('click', () => window.location.reload());

  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Technical details';
  const diagnostic = document.createElement('pre');
  diagnostic.textContent = formatErrorDetails(error);
  details.append(summary, diagnostic);

  section.append(heading, message, details, reload);
  root.replaceChildren(section);
}

function formatErrorDetails(error: unknown): string {
  const lines: string[] = [];
  const visited = new Set<unknown>();
  let current: unknown = error;

  while (current instanceof Error && !visited.has(current) && lines.length < 5) {
    visited.add(current);
    const code = current instanceof GameError ? ` [${current.code}]` : '';
    lines.push(`${current.name}${code}: ${current.message}`);
    current = current.cause;
  }

  return lines.length > 0
    ? lines.join('\nCaused by: ')
    : 'No additional error details are available.';
}
