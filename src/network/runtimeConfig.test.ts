import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSignalingUrl, resolveSignalingUrl } from './runtimeConfig';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('runtime multiplayer signaling configuration', () => {
  it('converts a site URL to the correct signaling socket URL', () => {
    expect(resolveSignalingUrl('https://signal.example.test', 'https:')).toBe(
      'wss://signal.example.test/signal',
    );
    expect(resolveSignalingUrl('http://127.0.0.1:8787', 'http:')).toBe(
      'ws://127.0.0.1:8787/signal',
    );
    expect(resolveSignalingUrl('wss://signal.example.test/signal', 'https:')).toBe(
      'wss://signal.example.test/signal',
    );
  });

  it('prefers secure transport for secure game pages and rejects invalid configuration', () => {
    expect(resolveSignalingUrl('ws://signal.example.test/signal', 'https:')).toBe(
      'wss://signal.example.test/signal',
    );
    expect(resolveSignalingUrl('', 'http:')).toBeNull();
    expect(resolveSignalingUrl('javascript:alert(1)', 'https:')).toBeNull();
  });

  it('uses the build-time URL when the runtime config file contains an empty placeholder', () => {
    vi.stubEnv('VITE_SIGNALING_URL', 'https://signal.example.test');
    vi.stubGlobal('window', {
      STONEFIELD_CONFIG: { signalingUrl: '' },
      location: { protocol: 'https:' },
    });

    expect(getSignalingUrl()).toBe('wss://signal.example.test/signal');
  });

  it('lets an explicit runtime URL override the build-time URL', () => {
    vi.stubEnv('VITE_SIGNALING_URL', 'https://build-signal.example.test');
    vi.stubGlobal('window', {
      STONEFIELD_CONFIG: { signalingUrl: 'https://runtime-signal.example.test' },
      location: { protocol: 'https:' },
    });

    expect(getSignalingUrl()).toBe('wss://runtime-signal.example.test/signal');
  });
});
