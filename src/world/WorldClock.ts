export const WORLD_DAY_SECONDS = 1_200;

export type DayPhase = 'night' | 'sunrise' | 'day' | 'sunset';

export function advanceWorldTime(worldTime: number, deltaSeconds: number): number {
  if (
    !Number.isFinite(worldTime) ||
    worldTime < 0 ||
    worldTime >= WORLD_DAY_SECONDS ||
    !Number.isFinite(deltaSeconds) ||
    deltaSeconds < 0
  ) {
    throw new RangeError(
      'World time must be within the day cycle and advance by a finite duration',
    );
  }
  return (worldTime + deltaSeconds) % WORLD_DAY_SECONDS;
}

export function getDaylight(worldTime: number): number {
  if (!Number.isFinite(worldTime) || worldTime < 0 || worldTime >= WORLD_DAY_SECONDS)
    throw new RangeError('World time is outside the day cycle');
  const elevation = Math.sin((worldTime / WORLD_DAY_SECONDS) * Math.PI * 2 - Math.PI / 2);
  return Math.max(0, Math.min(1, (elevation + 0.12) / 0.58));
}

export function dayPhase(worldTime: number): DayPhase {
  if (!Number.isFinite(worldTime) || worldTime < 0 || worldTime >= WORLD_DAY_SECONDS)
    throw new RangeError('World time is outside the day cycle');
  if (worldTime < 240 || worldTime >= 960) return 'night';
  if (worldTime < 360) return 'sunrise';
  if (worldTime < 840) return 'day';
  return 'sunset';
}
