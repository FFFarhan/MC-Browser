import { describe, expect, it } from 'vitest';
import { OriginManager } from '../rendering/OriginManager';
import { stepPlayer, type PlayerInput, type PlayerState } from './PlayerState';
import type { CollisionWorld } from '../physics/PlayerCollision';

const emptyInput: PlayerInput = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
  sprint: false,
  crouch: false,
  lookX: 0,
  lookY: 0,
};
const flatWorld: CollisionWorld = { collisionAt: (_x, y) => (y <= 0 ? 'solid' : 'empty') };
const initial: PlayerState = {
  position: { chunkX: 0, localX: 8, y: 1, chunkZ: 0, localZ: 8 },
  velocity: { x: 0, y: 0, z: 0 },
  yaw: 0,
  pitch: 0,
  grounded: true,
  crouching: false,
  jumpWasDown: false,
};

describe('fixed-step player state', () => {
  it('lands on the floor and edge-triggers jump only once while held', () => {
    const airborne = stepPlayer(initial, { ...emptyInput, jump: true }, flatWorld, 1 / 60);
    expect(airborne.velocity.y).toBeGreaterThan(0);
    expect(airborne.grounded).toBe(false);
    const held = stepPlayer(airborne, { ...emptyInput, jump: true }, flatWorld, 1 / 60);
    expect(held.velocity.y).toBeLessThan(airborne.velocity.y);

    let falling: PlayerState = {
      ...initial,
      position: { ...initial.position, y: 5 },
      velocity: { x: 0, y: -8, z: 0 },
      grounded: false,
    };
    for (let i = 0; i < 60; i += 1) falling = stepPlayer(falling, emptyInput, flatWorld, 1 / 60);
    expect(falling.position.y).toBeCloseTo(1, 3);
    expect(falling.grounded).toBe(true);
    expect(falling.velocity.y).toBe(0);
  });

  it('produces identical fixed-tick travel at 30, 60, and 144 rendered frames per second', () => {
    const run = (renderHz: number): PlayerState => {
      let state = initial;
      let accumulator = 0;
      for (let frame = 0; frame < renderHz * 2; frame += 1) {
        accumulator += 1 / renderHz;
        while (accumulator >= 1 / 60 - 1e-9) {
          state = stepPlayer(state, { ...emptyInput, forward: true }, flatWorld, 1 / 60);
          accumulator -= 1 / 60;
        }
      }
      return state;
    };
    const positions = [30, 60, 144].map((rate) => {
      const { chunkZ, localZ } = run(rate).position;
      return chunkZ * 16 + localZ;
    });
    expect(positions[0]).toBeCloseTo(positions[1] ?? 0, 8);
    expect(positions[1]).toBeCloseTo(positions[2] ?? 0, 8);
    expect(positions[0]).toBeLessThan(8);
  });

  it('preserves authoritative chunk/local position through floating-origin rebasing', () => {
    const state: PlayerState = {
      ...initial,
      position: { chunkX: 20, localX: 0.25, y: 7.5, chunkZ: -11, localZ: 15.75 },
    };
    const origin = new OriginManager(4);
    const before = origin.toRenderPosition({
      chunkX: state.position.chunkX,
      chunkZ: state.position.chunkZ,
      localX: state.position.localX,
      localZ: state.position.localZ,
      y: state.position.y,
    });
    expect(origin.rebaseIfNeeded({ x: state.position.chunkX, z: state.position.chunkZ })).toBe(
      true,
    );
    const after = origin.toRenderPosition({
      chunkX: state.position.chunkX,
      chunkZ: state.position.chunkZ,
      localX: state.position.localX,
      localZ: state.position.localZ,
      y: state.position.y,
    });
    expect(before.x).toBeCloseTo(state.position.chunkX * 16 + state.position.localX);
    expect(after.x).toBeCloseTo(state.position.localX);
    expect(state.position).toMatchObject({ chunkX: 20, localX: 0.25, chunkZ: -11, localZ: 15.75 });
  });
});
