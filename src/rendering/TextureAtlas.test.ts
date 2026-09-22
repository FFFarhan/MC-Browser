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

  it('rejects duplicate or empty texture keys', () => {
    expect(() => createAtlasPixels(1, ['stone', 'stone'])).toThrow(RangeError);
    expect(() => createAtlasPixels(1, [''])).toThrow(RangeError);
  });
});
