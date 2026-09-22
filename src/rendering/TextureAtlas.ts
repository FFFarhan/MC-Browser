import * as THREE from 'three';

export const TILE_SIZE = 16;
export const TILE_PADDING = 2;
export const DEFAULT_TEXTURE_KEYS = [
  'air',
  'grass_top',
  'grass_side',
  'dirt',
  'stone',
  'sand',
  'sandstone',
  'snow',
  'ice',
  'water_0',
  'water_1',
  'water_2',
  'water_3',
  'oak_log_end',
  'oak_log_side',
  'oak_leaves',
  'oak_planks',
  'crafting_top',
  'crafting_side',
  'furnace_front',
  'furnace_side',
  'coal_ore',
  'iron_ore',
  'coal_block',
  'iron_block',
  'cobblestone',
  'glass',
  'brick',
  'clay',
  'gravel',
  'torch',
  'tall_grass',
  'bedrock',
] as const;

export interface AtlasEntry {
  readonly key: string;
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
  readonly padding: number;
}

export interface AtlasManifest {
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  readonly padding: number;
  readonly entries: Readonly<Record<string, AtlasEntry>>;
}

export interface AtlasPixels {
  readonly pixels: Uint8ClampedArray;
  readonly manifest: AtlasManifest;
}

function seedHash(seed: number | string): number {
  const text = String(seed);
  let hash = 2_166_136_261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function randomFor(seed: number, key: string): () => number {
  let state = seedHash(`${seed}:${key}`) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4_294_967_296;
  };
}

const PALETTES: Record<string, readonly string[]> = {
  grass_top: ['#638e45', '#76a84d', '#86b85a', '#547d3e'],
  grass_side: ['#826342', '#98734a', '#6d9446', '#76a84d'],
  dirt: ['#76543a', '#856143', '#684a35', '#9a7049'],
  stone: ['#737a78', '#858a86', '#626b69', '#969893'],
  sand: ['#c4b27a', '#d4c58a', '#b9a66d', '#dfd19b'],
  sandstone: ['#c9b27e', '#d8c18b', '#bca571', '#e1cf9b'],
  snow: ['#e6ecea', '#fbffff', '#d4e0e3', '#f5f4e9'],
  ice: ['#9fcad0', '#c3e6e6', '#83b7c3', '#e0f4ec'],
  oak_log_end: ['#8f663c', '#a77b48', '#704d31', '#c09860'],
  oak_log_side: ['#785533', '#93683c', '#a47a48', '#68492f'],
  oak_leaves: ['#436b3d', '#578248', '#6c9650', '#365c38'],
  oak_planks: ['#9c7044', '#b18450', '#865e39', '#c3975d'],
  crafting_top: ['#8b653d', '#a27b49', '#6f5438', '#bd9158'],
  crafting_side: ['#805b38', '#a07849', '#704d31', '#bd9158'],
  furnace_front: ['#676d6b', '#7c817d', '#4b5352', '#242b2a'],
  furnace_side: ['#646b69', '#777d79', '#555d5c', '#858984'],
  coal_ore: ['#747b77', '#252b2b', '#858984', '#353b3a'],
  iron_ore: ['#737974', '#bd8057', '#858984', '#d19666'],
  coal_block: ['#272c2b', '#373e3b', '#171e1e', '#454a45'],
  iron_block: ['#a4aaa5', '#d0d5cf', '#8c9691', '#e3e5dc'],
  cobblestone: ['#747a76', '#858985', '#565f5e', '#a0a29b'],
  glass: ['#aed8d5', '#e4f5e8', '#83b9bd', '#c8e8e0'],
  brick: ['#a85d48', '#bd7358', '#8e493d', '#d28a65'],
  clay: ['#a7a096', '#b9b4a6', '#908f86', '#c7c0af'],
  gravel: ['#827d73', '#a29b8a', '#686b64', '#b5ad98'],
  bedrock: ['#393f40', '#535958', '#282f32', '#666b65'],
  torch: ['#b7864b', '#d3a95d', '#98683d', '#efd178'],
  tall_grass: ['#608f45', '#78a94f', '#45743e', '#91b95b'],
};

function hexColor(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function paintTile(
  pixels: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  key: string,
  seed: number,
): void {
  if (key === 'air') return;
  const rng = randomFor(seed, key);
  const palette = PALETTES[key] ?? ['#826b50', '#a08763', '#665640', '#b49a70'];
  const colors = palette.map(hexColor);
  const waterFrame = key.startsWith('water_') ? Number(key.at(-1)) : 0;
  const pixel = (x: number, y: number, color: readonly number[], alpha = 255): void => {
    const offset = ((y0 + y) * width + x0 + x) * 4;
    pixels[offset] = color[0] ?? 0;
    pixels[offset + 1] = color[1] ?? 0;
    pixels[offset + 2] = color[2] ?? 0;
    pixels[offset + 3] = alpha;
  };
  for (let y = 0; y < TILE_SIZE; y += 1) {
    for (let x = 0; x < TILE_SIZE; x += 1) {
      let color = colors[Math.floor(rng() * colors.length)] ?? [128, 128, 128];
      if (key === 'oak_log_end') {
        const radius = Math.hypot(x - 7.5, y - 7.5);
        color = colors[Math.floor(radius) % colors.length] ?? color;
        if (radius > 6.7 && radius < 7.7) color = colors[2] ?? color;
      } else if (key === 'oak_log_side' && (x + Math.floor(rng() * 3)) % 6 === 0) {
        color = colors[2] ?? color;
      } else if (key === 'grass_side' && y < 3) {
        color = colors[3] ?? color;
      } else if (key === 'crafting_top' && (x === 2 || x === 13 || y === 2 || y === 13)) {
        color = colors[2] ?? color;
      } else if (key === 'furnace_front' && x > 4 && x < 11 && y > 7 && y < 14) {
        color = colors[3] ?? color;
      } else if (
        key === 'brick' &&
        (y === 5 || y === 11 || (Math.floor(y / 6) % 2 === 0 ? x % 8 === 0 : (x + 4) % 8 === 0))
      ) {
        color = colors[2] ?? color;
      }
      if (key === 'oak_leaves' && rng() < 0.2) pixel(x, y, color, 0);
      else if (key === 'glass' && (x === y || x + y === 15)) pixel(x, y, colors[1] ?? color, 190);
      else if (key.startsWith('water_'))
        pixel(x, y, colors[(Math.floor(rng() * 2) + waterFrame) % colors.length] ?? color, 180);
      else pixel(x, y, color);
    }
  }
}

export function createAtlasPixels(
  seed: number | string,
  keys: readonly string[] = DEFAULT_TEXTURE_KEYS,
): AtlasPixels {
  if (keys.length === 0 || keys.some((key) => !key.trim()))
    throw new RangeError('Atlas texture keys must be nonempty');
  if (new Set(keys).size !== keys.length) throw new RangeError('Atlas texture keys must be unique');
  const sortedKeys = [...keys].sort();
  const cell = TILE_SIZE + TILE_PADDING * 2;
  const columns = Math.ceil(Math.sqrt(sortedKeys.length));
  const rows = Math.ceil(sortedKeys.length / columns);
  const width = columns * cell;
  const height = rows * cell;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const entries: Record<string, AtlasEntry> = {};
  sortedKeys.forEach((key, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * cell;
    const y = row * cell;
    const tileX = x + TILE_PADDING;
    const tileY = y + TILE_PADDING;
    paintTile(pixels, width, tileX, tileY, key, seedHash(seed));
    // Duplicate edge texels into the padding to prevent neighboring tiles bleeding.
    for (let pad = 1; pad <= TILE_PADDING; pad += 1) {
      for (let i = 0; i < TILE_SIZE; i += 1) {
        copyPixel(pixels, width, tileX + i, tileY, tileX + i, tileY - pad);
        copyPixel(
          pixels,
          width,
          tileX + i,
          tileY + TILE_SIZE - 1,
          tileX + i,
          tileY + TILE_SIZE - 1 + pad,
        );
        copyPixel(pixels, width, tileX, tileY + i, tileX - pad, tileY + i);
        copyPixel(
          pixels,
          width,
          tileX + TILE_SIZE - 1,
          tileY + i,
          tileX + TILE_SIZE - 1 + pad,
          tileY + i,
        );
      }
    }
    for (let py = 1; py <= TILE_PADDING; py += 1)
      for (let px = 1; px <= TILE_PADDING; px += 1) {
        copyPixel(pixels, width, tileX, tileY, tileX - px, tileY - py);
        copyPixel(
          pixels,
          width,
          tileX + TILE_SIZE - 1,
          tileY,
          tileX + TILE_SIZE - 1 + px,
          tileY - py,
        );
        copyPixel(
          pixels,
          width,
          tileX,
          tileY + TILE_SIZE - 1,
          tileX - px,
          tileY + TILE_SIZE - 1 + py,
        );
        copyPixel(
          pixels,
          width,
          tileX + TILE_SIZE - 1,
          tileY + TILE_SIZE - 1,
          tileX + TILE_SIZE - 1 + px,
          tileY + TILE_SIZE - 1 + py,
        );
      }
    entries[key] = Object.freeze({
      key,
      u0: tileX / width,
      v0: 1 - (tileY + TILE_SIZE) / height,
      u1: (tileX + TILE_SIZE) / width,
      v1: 1 - tileY / height,
      padding: TILE_PADDING,
    });
  });
  return {
    pixels,
    manifest: Object.freeze({
      width,
      height,
      tileSize: TILE_SIZE,
      padding: TILE_PADDING,
      entries: Object.freeze(entries),
    }),
  };
}

function copyPixel(
  pixels: Uint8ClampedArray,
  width: number,
  sx: number,
  sy: number,
  dx: number,
  dy: number,
): void {
  const source = (sy * width + sx) * 4;
  const destination = (dy * width + dx) * 4;
  pixels.copyWithin(destination, source, source + 4);
}

export function createTextureAtlas(seed: number | string): {
  texture: THREE.CanvasTexture;
  manifest: AtlasManifest;
} {
  const atlas = createAtlasPixels(seed);
  const canvas = document.createElement('canvas');
  canvas.width = atlas.manifest.width;
  canvas.height = atlas.manifest.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable for procedural texture generation');
  const image = context.createImageData(canvas.width, canvas.height);
  image.data.set(atlas.pixels);
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return { texture, manifest: atlas.manifest };
}
