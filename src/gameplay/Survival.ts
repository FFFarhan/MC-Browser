export interface SurvivalState {
  readonly health: number;
  readonly hunger: number;
  readonly activityProgress: number;
  readonly starvationProgress: number;
  readonly regenerationProgress: number;
}

export type ActivityLevel = 'idle' | 'walking' | 'sprinting';

const HUNGER_UNITS = 20;
const HUNGER_COST_INTERVAL = 120;
const STARVATION_DAMAGE_INTERVAL = 4;
const REGENERATION_INTERVAL = 15;

export function createSurvivalState(health = 20, hunger = 20): SurvivalState {
  validateUnit(health, 'health');
  validateUnit(hunger, 'hunger');
  return {
    health,
    hunger,
    activityProgress: 0,
    starvationProgress: 0,
    regenerationProgress: 0,
  };
}

export function tickSurvival(
  state: SurvivalState,
  deltaSeconds: number,
  activity: ActivityLevel,
): SurvivalState {
  validateState(state);
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0 || deltaSeconds > 3_600)
    throw new RangeError('Survival time step must be between zero and one hour');

  const activityRate = activity === 'sprinting' ? 3 : activity === 'walking' ? 1 : 0;
  let hunger = state.hunger;
  let health = state.health;
  let activityProgress = state.activityProgress + deltaSeconds * activityRate;
  while (activityProgress >= HUNGER_COST_INTERVAL && hunger > 0) {
    activityProgress -= HUNGER_COST_INTERVAL;
    hunger -= 1;
  }
  if (hunger === 0) activityProgress = 0;

  let starvationProgress = hunger === 0 ? state.starvationProgress + deltaSeconds : 0;
  while (starvationProgress >= STARVATION_DAMAGE_INTERVAL && health > 1) {
    starvationProgress -= STARVATION_DAMAGE_INTERVAL;
    health -= 1;
  }
  if (health <= 1) starvationProgress = 0;

  let regenerationProgress = state.regenerationProgress;
  if (hunger >= 18 && health > 0 && health < HUNGER_UNITS) {
    regenerationProgress += deltaSeconds;
    while (regenerationProgress >= REGENERATION_INTERVAL && health < HUNGER_UNITS && hunger >= 18) {
      regenerationProgress -= REGENERATION_INTERVAL;
      health += 1;
      hunger -= 1;
    }
  } else {
    regenerationProgress = 0;
  }

  return { health, hunger, activityProgress, starvationProgress, regenerationProgress };
}

export function eatFood(state: SurvivalState, hungerPoints: number): SurvivalState {
  validateState(state);
  if (!Number.isInteger(hungerPoints) || hungerPoints < 1 || hungerPoints > HUNGER_UNITS)
    throw new RangeError('Food value must be a positive whole number no greater than 20');
  return { ...state, hunger: Math.min(HUNGER_UNITS, state.hunger + hungerPoints) };
}

export function damagePlayer(state: SurvivalState, damage: number): SurvivalState {
  validateState(state);
  if (!Number.isFinite(damage) || damage < 0 || damage > 10_000)
    throw new RangeError('Damage must be finite and within the safe range');
  return {
    ...state,
    health: Math.max(0, state.health - Math.ceil(damage)),
    regenerationProgress: 0,
  };
}

export function calculateFallDamage(impactSpeed: number): number {
  if (!Number.isFinite(impactSpeed) || impactSpeed < 0)
    throw new RangeError('Fall impact speed must be finite and non-negative');
  if (impactSpeed <= 14) return 0;
  return Math.ceil((impactSpeed - 14) / 2);
}

function validateUnit(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > HUNGER_UNITS)
    throw new RangeError(`${label} must be a whole number between zero and 20`);
}

function validateState(state: SurvivalState): void {
  validateUnit(state.health, 'health');
  validateUnit(state.hunger, 'hunger');
  if (
    !Number.isFinite(state.activityProgress) ||
    state.activityProgress < 0 ||
    state.activityProgress >= HUNGER_COST_INTERVAL ||
    !Number.isFinite(state.starvationProgress) ||
    state.starvationProgress < 0 ||
    state.starvationProgress >= STARVATION_DAMAGE_INTERVAL ||
    !Number.isFinite(state.regenerationProgress) ||
    state.regenerationProgress < 0 ||
    state.regenerationProgress >= REGENERATION_INTERVAL
  ) {
    throw new RangeError('Survival state timers are outside their safe bounds');
  }
}
