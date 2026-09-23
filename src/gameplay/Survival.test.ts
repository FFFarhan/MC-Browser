import { describe, expect, it } from 'vitest';
import {
  calculateFallDamage,
  createSurvivalState,
  damagePlayer,
  eatFood,
  tickSurvival,
} from './Survival';

describe('basic survival simulation', () => {
  it('starts full and only spends hunger while active', () => {
    const state = createSurvivalState();
    expect(state).toMatchObject({ health: 20, hunger: 20 });
    expect(tickSurvival(state, 180, 'idle').hunger).toBe(20);
    expect(tickSurvival(state, 120, 'walking').hunger).toBe(19);
    expect(tickSurvival(state, 40, 'sprinting').hunger).toBe(19);
  });

  it('regenerates at high hunger, and bounded starvation never kills by itself', () => {
    const injured = { ...createSurvivalState(), health: 18 };
    expect(tickSurvival(injured, 15, 'idle')).toMatchObject({ health: 19, hunger: 19 });
    const starving = { ...createSurvivalState(), hunger: 0 };
    expect(tickSurvival(starving, 12, 'idle').health).toBe(17);
    expect(tickSurvival({ ...starving, health: 1 }, 40, 'idle').health).toBe(1);
  });

  it('caps food recovery and health damage at valid bounds', () => {
    expect(eatFood(createSurvivalState(), 4).hunger).toBe(20);
    expect(eatFood({ ...createSurvivalState(), hunger: 10 }, 4).hunger).toBe(14);
    expect(damagePlayer(createSurvivalState(), 25).health).toBe(0);
    expect(() => eatFood(createSurvivalState(), -1)).toThrow(RangeError);
  });

  it('keeps short falls safe and makes a terminal-speed fall lethal at full health', () => {
    expect(calculateFallDamage(14)).toBe(0);
    expect(calculateFallDamage(15)).toBe(1);
    expect(calculateFallDamage(55)).toBeGreaterThanOrEqual(20);
    expect(damagePlayer(createSurvivalState(), calculateFallDamage(55)).health).toBe(0);
    expect(() => calculateFallDamage(Number.NaN)).toThrow(RangeError);
  });
});
