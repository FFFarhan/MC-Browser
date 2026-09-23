import { describe, expect, it } from 'vitest';
import { MiningProgress } from './MiningProgress';

describe('held block mining', () => {
  it('finishes according to block hardness and restarts when the target changes', () => {
    const mining = new MiningProgress();
    const grass = { key: '4,72,8:grass', hardnessSeconds: 0.4 };
    const stone = { key: '4,72,8:stone', hardnessSeconds: 1.6 };

    expect(mining.advance(grass, true, 0.2)).toEqual({ progress: 0.5, complete: false });
    expect(mining.advance(stone, true, 0.2)).toEqual({ progress: 0.125, complete: false });
    expect(mining.advance(stone, true, 1.4)).toEqual({ progress: 1, complete: true });
  });

  it('cancels progress when the mouse is released or the target is lost', () => {
    const mining = new MiningProgress();
    const target = { key: '4,72,8', hardnessSeconds: 1 };
    mining.advance(target, true, 0.6);

    expect(mining.advance(target, false, 0.1)).toEqual({ progress: 0, complete: false });
    mining.advance(target, true, 0.6);
    expect(mining.advance(null, true, 0.1)).toEqual({ progress: 0, complete: false });
  });

  it('rejects invalid frame time and ignores unbreakable targets', () => {
    const mining = new MiningProgress();
    expect(() => mining.advance({ key: 'rock', hardnessSeconds: 1 }, true, Number.NaN)).toThrow(
      RangeError,
    );
    expect(mining.advance({ key: 'bedrock', hardnessSeconds: 0 }, true, 0.1)).toEqual({
      progress: 0,
      complete: false,
    });
  });
});
