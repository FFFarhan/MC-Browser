import {
  isPlayerAabbBlocked,
  sweepAabb,
  type CollisionWorld,
  type PlayerPosition,
  type PlayerVector,
} from '../physics/PlayerCollision';

export const DEFAULT_PLAYER_COLLIDER = Object.freeze({
  radiusX: 0.3,
  radiusZ: 0.3,
  standingHeight: 1.8,
  crouchingHeight: 1.5,
});
const GRAVITY = 24;
const TERMINAL_VELOCITY = -55;
const JUMP_SPEED = 8.5;
const FIXED_STEP_LIMIT = 0.05;
const MAX_PITCH = Math.PI / 2 - 0.01;

export interface PlayerState {
  readonly position: PlayerPosition;
  readonly velocity: PlayerVector;
  readonly yaw: number;
  readonly pitch: number;
  readonly grounded: boolean;
  readonly crouching: boolean;
  readonly jumpWasDown: boolean;
}

export interface PlayerInput {
  readonly forward: boolean;
  readonly backward: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly jump: boolean;
  readonly sprint: boolean;
  readonly crouch: boolean;
  readonly lookX: number;
  readonly lookY: number;
}

export function createPlayerState(position: PlayerPosition, yaw = 0): PlayerState {
  validatePosition(position);
  if (!Number.isFinite(yaw)) throw new RangeError('Player yaw must be finite');
  return {
    position: { ...position },
    velocity: { x: 0, y: 0, z: 0 },
    yaw,
    pitch: 0,
    grounded: false,
    crouching: false,
    jumpWasDown: false,
  };
}

export function stepPlayer(
  state: PlayerState,
  input: PlayerInput,
  world: CollisionWorld,
  dt: number,
): PlayerState {
  if (!Number.isFinite(dt) || dt <= 0 || dt > FIXED_STEP_LIMIT) {
    throw new RangeError(`Player simulation step must be in (0, ${FIXED_STEP_LIMIT}] seconds`);
  }
  validatePosition(state.position);
  if (![input.lookX, input.lookY].every(Number.isFinite))
    throw new RangeError('Look input must be finite');
  const yaw = normalizeAngle(state.yaw + input.lookX);
  const pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, state.pitch - input.lookY));

  let crouching = input.crouch || state.crouching;
  if (
    state.crouching &&
    !input.crouch &&
    !isPlayerAabbBlocked(
      state.position,
      DEFAULT_PLAYER_COLLIDER,
      world,
      DEFAULT_PLAYER_COLLIDER.standingHeight,
    )
  ) {
    crouching = false;
  }
  if (!state.crouching && input.crouch) crouching = true;
  const height = crouching
    ? DEFAULT_PLAYER_COLLIDER.crouchingHeight
    : DEFAULT_PLAYER_COLLIDER.standingHeight;
  const forwardInput = Number(input.forward) - Number(input.backward);
  const strafeInput = Number(input.right) - Number(input.left);
  const length = Math.hypot(forwardInput, strafeInput);
  const normalizedForward = length > 0 ? forwardInput / length : 0;
  const normalizedStrafe = length > 0 ? strafeInput / length : 0;
  const targetSpeed = crouching ? 1.6 : input.sprint ? 7 : 4.6;
  const desiredX =
    (normalizedStrafe * Math.cos(yaw) - normalizedForward * Math.sin(yaw)) * targetSpeed;
  const desiredZ =
    (normalizedStrafe * Math.sin(yaw) - normalizedForward * Math.cos(yaw)) * targetSpeed;
  const acceleration = state.grounded ? 28 : 8;
  const friction = state.grounded ? 32 : 1.5;
  const vx = approach(
    state.velocity.x,
    length > 0 ? desiredX : 0,
    (length > 0 ? acceleration : friction) * dt,
  );
  const vz = approach(
    state.velocity.z,
    length > 0 ? desiredZ : 0,
    (length > 0 ? acceleration : friction) * dt,
  );
  let vy = Math.max(TERMINAL_VELOCITY, state.velocity.y - GRAVITY * dt);
  if (input.jump && !state.jumpWasDown && state.grounded) vy = JUMP_SPEED;

  const horizontal = sweepAabb(
    state.position,
    { x: vx * dt, y: 0, z: vz * dt },
    DEFAULT_PLAYER_COLLIDER,
    world,
    height,
  );
  const vertical = sweepAabb(
    horizontal.position,
    { x: 0, y: vy * dt, z: 0 },
    DEFAULT_PLAYER_COLLIDER,
    world,
    height,
  );
  return {
    position: vertical.position,
    velocity: {
      x: horizontal.velocity.x / dt,
      y: vertical.velocity.y / dt,
      z: horizontal.velocity.z / dt,
    },
    yaw,
    pitch,
    grounded: vertical.grounded,
    crouching,
    jumpWasDown: input.jump,
  };
}

function approach(value: number, target: number, delta: number): number {
  if (value < target) return Math.min(value + delta, target);
  return Math.max(value - delta, target);
}

function normalizeAngle(angle: number): number {
  const wrapped = ((((angle + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

function validatePosition(position: PlayerPosition): void {
  if (
    !Number.isSafeInteger(position.chunkX) ||
    !Number.isSafeInteger(position.chunkZ) ||
    !Number.isFinite(position.localX) ||
    position.localX < 0 ||
    position.localX >= 16 ||
    !Number.isFinite(position.localZ) ||
    position.localZ < 0 ||
    position.localZ >= 16 ||
    !Number.isFinite(position.y)
  ) {
    throw new RangeError('Player position is outside the normalized world coordinate form');
  }
}
