export interface GridPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
export interface BlockHit {
  readonly block: GridPosition & { readonly id: number };
  readonly previous: GridPosition | null;
  readonly normal: GridPosition;
  readonly distance: number;
}
export type BlockReader = (x: number, y: number, z: number) => number | null;

export function traceVoxels(
  origin: GridPosition,
  direction: GridPosition,
  maxDistance: number,
  readBlock: BlockReader,
): BlockHit | null {
  if (
    ![origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, maxDistance].every(
      Number.isFinite,
    ) ||
    maxDistance < 0 ||
    maxDistance > 128
  ) {
    throw new RangeError('Voxel ray inputs must be finite and max distance must be in [0,128]');
  }
  const magnitude = Math.hypot(direction.x, direction.y, direction.z);
  if (magnitude < 1e-12) throw new RangeError('Voxel ray direction must not be zero');
  const ray = {
    x: direction.x / magnitude,
    y: direction.y / magnitude,
    z: direction.z / magnitude,
  };
  const cell = { x: Math.floor(origin.x), y: Math.floor(origin.y), z: Math.floor(origin.z) };
  let previous: GridPosition | null = null;
  let normal: GridPosition = { x: 0, y: 0, z: 0 };
  const initial = readBlock(cell.x, cell.y, cell.z);
  if (initial === null) return null;
  if (initial !== 0) return { block: { ...cell, id: initial }, previous, normal, distance: 0 };

  const axis = (coordinate: number, originValue: number, directionValue: number) => {
    if (Math.abs(directionValue) < 1e-12) return { step: 0, delta: Infinity, max: Infinity };
    const step = Math.sign(directionValue);
    const boundary = step > 0 ? coordinate + 1 : coordinate;
    return {
      step,
      delta: Math.abs(1 / directionValue),
      max: (boundary - originValue) / directionValue,
    };
  };
  const x = axis(cell.x, origin.x, ray.x);
  const y = axis(cell.y, origin.y, ray.y);
  const z = axis(cell.z, origin.z, ray.z);
  const maxSteps = Math.ceil(maxDistance * 3) + 4;
  for (let steps = 0; steps < maxSteps; steps += 1) {
    let chosen: 'x' | 'y' | 'z';
    if (x.max <= y.max && x.max <= z.max) chosen = 'x';
    else if (y.max <= z.max) chosen = 'y';
    else chosen = 'z';
    const crossing = chosen === 'x' ? x : chosen === 'y' ? y : z;
    const distance = crossing.max;
    if (distance > maxDistance) return null;
    previous = { ...cell };
    cell[chosen] += crossing.step;
    normal =
      chosen === 'x'
        ? { x: -crossing.step, y: 0, z: 0 }
        : chosen === 'y'
          ? { x: 0, y: -crossing.step, z: 0 }
          : { x: 0, y: 0, z: -crossing.step };
    crossing.max += crossing.delta;
    const id = readBlock(cell.x, cell.y, cell.z);
    if (id === null) return null;
    if (id !== 0) return { block: { ...cell, id }, previous, normal, distance };
  }
  return null;
}
