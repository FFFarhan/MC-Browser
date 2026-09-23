import { describe, expect, it } from 'vitest';
import { createAtlasPixels, DEFAULT_TEXTURE_KEYS } from './TextureAtlas';

function hashPixels(bytes: Uint8ClampedArray): string {
  let hash = 2_166_136_261;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

describe('procedural texture atlas', () => {
  it('generates the same atlas pixels and manifest for the same seed', () => {
    const first = createAtlasPixels('cedar-valley');
    const second = createAtlasPixels('cedar-valley');

    expect(hashPixels(first.pixels)).toBe(hashPixels(second.pixels));
    expect(first.manifest).toEqual(second.manifest);
    expect(first.manifest.entries['grass_top']).toBeDefined();
    expect(first.manifest.entries['oak_log_end']).toBeDefined();
    expect(DEFAULT_TEXTURE_KEYS.length).toBeGreaterThanOrEqual(25);
  });

  it('keeps unique texture keys inside padded UV bounds', () => {
    const { manifest } = createAtlasPixels(42);
    const entries = Object.values(manifest.entries);

    expect(entries).toHaveLength(new Set(entries.map((entry) => entry.key)).size);
    for (const entry of entries) {
      expect(entry.u0).toBeGreaterThanOrEqual(0);
      expect(entry.v0).toBeGreaterThanOrEqual(0);
      expect(entry.u1).toBeLessThanOrEqual(1);
      expect(entry.v1).toBeLessThanOrEqual(1);
      expect(entry.padding).toBeGreaterThanOrEqual(2);
    }
  });

  it('renders glass with mostly transparent fill and a bright visible frame', () => {
    const { pixels, manifest } = createAtlasPixels(42, ['glass']);
    const entry = manifest.entries['glass'];
    if (!entry) throw new Error('glass atlas entry missing');
    const x0 = Math.round(entry.u0 * manifest.width);
    const y0 = Math.round((1 - entry.v1) * manifest.height);
    const alphaValues: number[] = [];
    let brightFramePixels = 0;
    for (let y = 0; y < manifest.tileSize; y += 1) {
      for (let x = 0; x < manifest.tileSize; x += 1) {
        const offset = ((y0 + y) * manifest.width + x0 + x) * 4;
        const alpha = pixels[offset + 3] ?? 0;
        alphaValues.push(alpha);
        if (alpha >= 150 && (x === 1 || x === 14 || y === 1 || y === 14)) {
          const r = pixels[offset] ?? 0;
          const g = pixels[offset + 1] ?? 0;
          const b = pixels[offset + 2] ?? 0;
          if (r + g + b > 500) brightFramePixels += 1;
        }
      }
    }
    expect(alphaValues.filter((alpha) => alpha <= 80).length).toBeGreaterThan(160);
    expect(brightFramePixels).toBeGreaterThan(20);
  });

  it('rejects duplicate or empty texture keys', () => {
    expect(() => createAtlasPixels(1, ['stone', 'stone'])).toThrow(RangeError);
    expect(() => createAtlasPixels(1, [''])).toThrow(RangeError);
  });
});
