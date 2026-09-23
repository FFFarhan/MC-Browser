import { describe, expect, it } from 'vitest';
import { FpsSampler } from './FpsSampler';

function sampleRate(frameRate: number): number | null {
  const sampler = new FpsSampler();
  sampler.addFrame(0);
  let reading: number | null = null;
  for (let frame = 1; frame <= frameRate; frame += 1)
    reading = sampler.addFrame((frame * 1_000) / frameRate) ?? reading;
  return reading;
}

describe('render-frame FPS sampler', () => {
  it.each([30, 60, 144])('measures %i rendered frames per second', (frameRate) => {
    expect(sampleRate(frameRate)).toBe(frameRate);
  });

  it('waits for one measured window and handles irregular frame spacing', () => {
    const sampler = new FpsSampler();
    expect(sampler.addFrame(0)).toBeNull();
    let reading: number | null = null;
    for (let frame = 1; frame <= 60; frame += 1) {
      const timestamp = frame === 60 ? 1_000 : (frame * 1_000) / 60 + (frame % 2 ? 3 : -3);
      reading = sampler.addFrame(timestamp) ?? reading;
    }
    expect(reading).toBe(60);
  });

  it('drops stale samples after a suspended frame gap and starts a fresh window', () => {
    const sampler = new FpsSampler();
    expect(sampler.addFrame(0)).toBeNull();
    expect(sampler.addFrame(16)).toBeNull();
    expect(sampler.addFrame(2_500)).toBeNull();
    let reading: number | null = null;
    for (let frame = 1; frame <= 60; frame += 1)
      reading = sampler.addFrame(2_500 + (frame * 1_000) / 60) ?? reading;
    expect(reading).toBe(60);
    sampler.reset();
    expect(sampler.addFrame(10_000)).toBeNull();
  });
});
