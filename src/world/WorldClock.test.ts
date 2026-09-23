import { describe, expect, it } from 'vitest';
import { advanceWorldTime, dayPhase, getDaylight, WORLD_DAY_SECONDS } from './WorldClock';

describe('world time', () => {
  it('advances deterministically and wraps at the 20-minute day boundary', () => {
    expect(advanceWorldTime(1_199, 2)).toBe(1);
    expect(advanceWorldTime(14, 0)).toBe(14);
    expect(() => advanceWorldTime(0, Number.NaN)).toThrow(RangeError);
    expect(WORLD_DAY_SECONDS).toBe(1_200);
  });

  it('moves through night, sunrise, noon, and sunset in order', () => {
    expect(dayPhase(0)).toBe('night');
    expect(dayPhase(300)).toBe('sunrise');
    expect(dayPhase(600)).toBe('day');
    expect(dayPhase(900)).toBe('sunset');
    expect(getDaylight(600)).toBeGreaterThan(getDaylight(0));
  });
});
