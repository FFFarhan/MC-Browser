import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RemotePlayerView } from './RemotePlayerView';

describe('RemotePlayerView', () => {
  it('keeps a fixed instanced object count and updates remote transforms', () => {
    const scene = new THREE.Scene();
    const view = new RemotePlayerView(scene);
    const baseline = scene.children.length;
    view.update([{ peerId: 'peer-1', pose: { x: 17, y: 4, z: -3, yaw: 0, pitch: 0 } }], {
      x: 1,
      z: -1,
    });
    view.update([], { x: 1, z: -1 });
    expect(scene.children).toHaveLength(baseline);
    expect(view.meshCount).toBe(2);
    expect(view.renderedPlayerCount).toBe(0);
    view.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('rejects more remote players than the four-player session cap', () => {
    const view = new RemotePlayerView(new THREE.Scene());
    const players = Array.from({ length: 4 }, (_, index) => ({
      peerId: `peer-${index}`,
      pose: { x: index, y: 2, z: 0, yaw: 0, pitch: 0 },
    }));
    expect(() => view.update(players, { x: 0, z: 0 })).toThrow(/capacity/i);
    view.dispose();
  });
});
