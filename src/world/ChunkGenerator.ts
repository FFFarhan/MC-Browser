import type { ChunkMeshSnapshot } from '../meshing/mesh-types';
import { CHUNK_SIZE, CHUNK_VOLUME, WORLD_HEIGHT, worldBlockIndex } from '../shared/coordinates';
import type { ChunkCoord } from '../shared/coordinates';
import { BLOCK_ID, DEFAULT_BLOCK_DEFINITIONS } from './defaultBlocks';

export type Biome = 'plains' | 'forest' | 'desert' | 'mountains' | 'snow' | 'ocean';

export const SEA_LEVEL = 62;
export const CHUNK_GENERATOR_VERSION = 1;

function hashSeed(seed: number | string): number {
  if (typeof seed === 'number' && !Number.isFinite(seed)) {
    throw new RangeError('World seed must be finite');
  }
  const text = String(seed);
  if (!text.trim()) throw new RangeError('World seed must not be empty');
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function lattice(seed: number, x: number, y: number, z: number): number {
  let value = seed ^ Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77) ^ Math.imul(z, 0xc2b2ae3d);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 2_147_483_647.5 - 1;
}

function smooth(value: number): number {
  return value * value * (3 - 2 * value);
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function noise2(seed: number, x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = smooth(x - x0);
  const tz = smooth(z - z0);
  const a = mix(lattice(seed, x0, 0, z0), lattice(seed, x0 + 1, 0, z0), tx);
  const b = mix(lattice(seed, x0, 0, z0 + 1), lattice(seed, x0 + 1, 0, z0 + 1), tx);
  return mix(a, b, tz);
}

function noise3(seed: number, x: number, y: number, z: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const tz = smooth(z - z0);
  const low = mix(
    mix(lattice(seed, x0, y0, z0), lattice(seed, x0 + 1, y0, z0), tx),
    mix(lattice(seed, x0, y0, z0 + 1), lattice(seed, x0 + 1, y0, z0 + 1), tx),
    tz,
  );
  const high = mix(
    mix(lattice(seed, x0, y0 + 1, z0), lattice(seed, x0 + 1, y0 + 1, z0), tx),
    mix(lattice(seed, x0, y0 + 1, z0 + 1), lattice(seed, x0 + 1, y0 + 1, z0 + 1), tx),
    tz,
  );
  return mix(low, high, ty);
}

function terrainHeight(seed: number, worldX: number, worldZ: number): number {
  const broad = noise2(seed, worldX / 72, worldZ / 72);
  const detail = noise2(seed ^ 0x51ed270b, worldX / 20, worldZ / 20);
  return Math.max(20, Math.min(128, Math.round(78 + broad * 30 + detail * 10)));
}

function biomeFor(seed: number, worldX: number, worldZ: number, height: number): Biome {
  if (height < SEA_LEVEL + 1) return 'ocean';
  const temperature = noise2(seed ^ 0x2c1b3c6d, worldX / 160, worldZ / 160);
  const moisture = noise2(seed ^ 0x297a2d39, worldX / 120, worldZ / 120);
  if (height > 104) return temperature < -0.12 ? 'snow' : 'mountains';
  if (temperature < -0.48) return 'snow';
  if (temperature > 0.38 && moisture < -0.05) return 'desert';
  if (moisture > 0.12) return 'forest';
  return 'plains';
}

export function getTerrainHeight(seed: number | string, worldX: number, worldZ: number): number {
  if (!Number.isSafeInteger(worldX) || !Number.isSafeInteger(worldZ)) {
    throw new RangeError('Terrain coordinates must be safe integers');
  }
  return terrainHeight(hashSeed(seed), worldX, worldZ);
}

export function getBiome(seed: number | string, worldX: number, worldZ: number): Biome {
  if (!Number.isSafeInteger(worldX) || !Number.isSafeInteger(worldZ)) {
    throw new RangeError('Biome coordinates must be safe integers');
  }
  const rootSeed = hashSeed(seed);
  const height = terrainHeight(rootSeed, worldX, worldZ);
  return biomeFor(rootSeed, worldX, worldZ, height);
}

function setBlock(blocks: Uint16Array, x: number, y: number, z: number, id: number): void {
  if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return;
  blocks[worldBlockIndex(x, y, z)] = id;
}

function treeChance(seed: number, x: number, z: number): number {
  return (lattice(seed ^ 0x7f4a7c15, x, 619, z) + 1) / 2;
}

export function generateChunk(coord: ChunkCoord, seed: number | string): ChunkMeshSnapshot {
  if (!Number.isSafeInteger(coord.x) || !Number.isSafeInteger(coord.z)) {
    throw new RangeError('Chunk coordinates must be safe integers');
  }
  const rootSeed = hashSeed(seed);
  const chunkOriginX = coord.x * CHUNK_SIZE;
  const chunkOriginZ = coord.z * CHUNK_SIZE;
  if (!Number.isSafeInteger(chunkOriginX) || !Number.isSafeInteger(chunkOriginZ)) {
    throw new RangeError('Chunk origin exceeds the safe world coordinate range');
  }
  const blocks = new Uint16Array(CHUNK_VOLUME);

  for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
    for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
      const worldX = chunkOriginX + localX;
      const worldZ = chunkOriginZ + localZ;
      const height = terrainHeight(rootSeed, worldX, worldZ);
      const biome = biomeFor(rootSeed, worldX, worldZ, height);
      const sandy = biome === 'desert' || biome === 'ocean';
      const surface =
        biome === 'snow' ? BLOCK_ID['snow']! : sandy ? BLOCK_ID['sand']! : BLOCK_ID['grass']!;
      const soil = sandy ? BLOCK_ID['sand']! : BLOCK_ID['dirt']!;

      setBlock(blocks, localX, 0, localZ, BLOCK_ID['bedrock']!);
      for (let y = 1; y <= height; y += 1) {
        const block =
          y === height ? surface : y >= height - (sandy ? 3 : 2) ? soil : BLOCK_ID['stone']!;
        setBlock(blocks, localX, y, localZ, block);
      }

      if (height < SEA_LEVEL) {
        for (let y = height + 1; y <= SEA_LEVEL; y += 1)
          setBlock(blocks, localX, y, localZ, BLOCK_ID['water']!);
      }

      for (let y = 4; y < height - 3; y += 1) {
        const currentIndex = worldBlockIndex(localX, y, localZ);
        if (blocks[currentIndex] !== BLOCK_ID['stone']) continue;
        const cave = noise3(rootSeed ^ 0x4cf5ad43, worldX / 19, y / 12, worldZ / 19);
        if (Math.abs(cave) < 0.075) {
          blocks[currentIndex] = BLOCK_ID['air']!;
          continue;
        }
        const ore = noise3(rootSeed ^ 0x6d2b79f5, worldX / 4, y / 3, worldZ / 4);
        if (y <= 21 && ore > 0.78) blocks[currentIndex] = BLOCK_ID['iron_ore']!;
        else if (y <= 42 && ore > 0.64) blocks[currentIndex] = BLOCK_ID['coal_ore']!;
      }

      if (
        (biome === 'forest' || biome === 'plains') &&
        height > SEA_LEVEL &&
        treeChance(rootSeed ^ 0x269ec3, worldX, worldZ) < 0.045
      ) {
        setBlock(blocks, localX, height + 1, localZ, BLOCK_ID['tall_grass']!);
      }
    }
  }

  // Evaluate a two-block halo of tree roots so canopies match on both sides of a chunk edge.
  for (let rootZ = chunkOriginZ - 2; rootZ < chunkOriginZ + CHUNK_SIZE + 2; rootZ += 1) {
    for (let rootX = chunkOriginX - 2; rootX < chunkOriginX + CHUNK_SIZE + 2; rootX += 1) {
      const height = terrainHeight(rootSeed, rootX, rootZ);
      const biome = biomeFor(rootSeed, rootX, rootZ, height);
      if (
        (biome !== 'forest' && biome !== 'plains') ||
        height <= SEA_LEVEL ||
        treeChance(rootSeed, rootX, rootZ) >= (biome === 'forest' ? 0.025 : 0.006)
      ) {
        continue;
      }
      const localRootX = rootX - chunkOriginX;
      const localRootZ = rootZ - chunkOriginZ;
      const trunkHeight = 4 + Math.floor(treeChance(rootSeed ^ 0x13, rootX, rootZ) * 2);
      for (let y = 1; y <= trunkHeight; y += 1)
        setBlock(blocks, localRootX, height + y, localRootZ, BLOCK_ID['oak_log']!);
      for (let y = trunkHeight - 1; y <= trunkHeight + 2; y += 1) {
        const radius = y > trunkHeight ? 1 : 2;
        for (let dz = -radius; dz <= radius; dz += 1)
          for (let dx = -radius; dx <= radius; dx += 1) {
            if (Math.abs(dx) + Math.abs(dz) > radius * 2 - 1) continue;
            const leafX = localRootX + dx;
            const leafZ = localRootZ + dz;
            if (
              leafX < 0 ||
              leafX >= CHUNK_SIZE ||
              leafZ < 0 ||
              leafZ >= CHUNK_SIZE ||
              height + y >= WORLD_HEIGHT
            ) {
              continue;
            }
            const index = worldBlockIndex(leafX, height + y, leafZ);
            if (blocks[index] === BLOCK_ID['air']) blocks[index] = BLOCK_ID['oak_leaves']!;
          }
      }
    }
  }

  return {
    coord: { ...coord },
    blocks,
    revision: 0,
    definitions: DEFAULT_BLOCK_DEFINITIONS,
    neighbors: {},
  };
}
