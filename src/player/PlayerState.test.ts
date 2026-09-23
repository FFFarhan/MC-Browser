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
  it('uses rightward-positive mouse yaw and camera-relative A/D at cardinal headings', () => {
    const turned = stepPlayer(
      initial,
      { ...emptyInput, lookX: 0.25, lookY: 0.2 },
      flatWorld,
      1 / 60,
    );
    expect(turned.yaw).toBeLessThan(0);
    expect(turned.pitch).toBeCloseTo(-0.2);

    for (const yaw of [0, Math.PI / 2, -Math.PI / 2]) {
      const right = stepPlayer(
        { ...initial, yaw },
        { ...emptyInput, right: true },
        flatWorld,
        0.05,
      );
      const left = stepPlayer({ ...initial, yaw }, { ...emptyInput, left: true }, flatWorld, 0.05);
      const rightExpected = { x: Math.cos(yaw), z: -Math.sin(yaw) };
      const rightLength = Math.hypot(right.velocity.x, right.velocity.z);
      const leftLength = Math.hypot(left.velocity.x, left.velocity.z);

      expect(right.velocity.x / rightLength).toBeCloseTo(rightExpected.x, 5);
      expect(right.velocity.z / rightLength).toBeCloseTo(rightExpected.z, 5);
      expect(left.velocity.x / leftLength).toBeCloseTo(-rightExpected.x, 5);
      expect(left.velocity.z / leftLength).toBeCloseTo(-rightExpected.z, 5);
    }
  });

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

  it('ascends, hovers, and descends while creative flight is enabled', () => {
    const airborne: PlayerState = {
      ...initial,
      position: { ...initial.position, y: 5 },
      velocity: { x: 0, y: 0, z: 0 },
      grounded: false,
      jumpWasDown: true,
    };
    const ascendInput = Object.assign({}, emptyInput, { jump: true, flying: true });
    const hoverInput = Object.assign({}, emptyInput, { flying: true });
    const descendInput = Object.assign({}, emptyInput, { flying: true, flyDown: true });
    const ascend = stepPlayer(airborne, ascendInput, flatWorld, 0.05);
    const hover = stepPlayer(airborne, hoverInput, flatWorld, 0.05);
    const descend = stepPlayer(airborne, descendInput, flatWorld, 0.05);

    expect(ascend.position.y).toBeGreaterThan(5);
    expect(hover.position.y).toBe(5);
    expect(descend.position.y).toBeLessThan(5);
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
