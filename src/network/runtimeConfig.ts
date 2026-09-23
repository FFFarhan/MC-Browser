export interface StonefieldRuntimeConfig {
  readonly signalingUrl?: string;
}

declare global {
  interface Window {
    STONEFIELD_CONFIG?: StonefieldRuntimeConfig;
  }
}

export function resolveSignalingUrl(
  configured: string | null | undefined,
  pageProtocol = 'https:',
): string | null {
  if (!configured?.trim()) return null;
  let url: URL;
  try {
    url = new URL(configured.trim());
  } catch {
    return null;
  }
  const supportedProtocol = ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol);
  if (!url.hostname || !supportedProtocol) return null;

  const securePage = pageProtocol === 'https:';
  if (url.protocol === 'http:') url.protocol = securePage ? 'wss:' : 'ws:';
  else if (url.protocol === 'https:' || securePage) url.protocol = 'wss:';

  const path = url.pathname.replace(/\/+$/, '');
  if (!path || path === '/') url.pathname = '/signal';
  else if (!path.endsWith('/signal')) url.pathname = `${path}/signal`;
  url.hash = '';
  return url.toString();
}

export function getSignalingUrl(): string | null {
  const injected =
    typeof window === 'undefined' ? undefined : window.STONEFIELD_CONFIG?.signalingUrl;
  const configured = injected?.trim() ? injected : import.meta.env['VITE_SIGNALING_URL'];
  const pageProtocol = typeof window === 'undefined' ? 'https:' : window.location.protocol;
  return resolveSignalingUrl(configured, pageProtocol);
}
