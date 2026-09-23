import { describe, expect, it, vi } from 'vitest';
import { FixedStepLoop } from './FixedStepLoop';

describe('FixedStepLoop', () => {
  it('limits catch-up work to five ticks and discards the remaining lag', () => {
    const frames = new Map<number, FrameRequestCallback>();
    let nextId = 1;
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    });
    const cancelFrame = vi.fn((id: number) => frames.delete(id));
    const tick = vi.fn();
    const loop = new FixedStepLoop(tick, requestFrame, cancelFrame);

    loop.start();
    frames.get(1)?.(0);
    frames.get(2)?.(1000);

    expect(tick).toHaveBeenCalledTimes(5);
    expect(loop.metrics.discardedCatchUpFrames).toBeGreaterThan(0);
    loop.dispose();
  });

  it('resets its frame clock after resuming from a pause', () => {
    const frames = new Map<number, FrameRequestCallback>();
    let nextId = 1;
    const requestFrame = (callback: FrameRequestCallback) => {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    };
    const cancelFrame = (id: number) => frames.delete(id);
    const tick = vi.fn();
    const loop = new FixedStepLoop(tick, requestFrame, cancelFrame);

    loop.start();
    frames.get(1)?.(0);
    frames.get(2)?.(17);
    expect(tick).toHaveBeenCalledTimes(1);

    loop.pause();
    loop.resume();
    frames.get(3)?.(5000);

    expect(tick).toHaveBeenCalledTimes(1);
    loop.dispose();
  });

  it('calls browser animation frame APIs with the window receiver', () => {
    const originalRequest = window.requestAnimationFrame;
    const originalCancel = window.cancelAnimationFrame;
    const receivers: unknown[] = [];
    window.requestAnimationFrame = function (this: Window) {
      receivers.push(this);
      return 1;
    };
    window.cancelAnimationFrame = function (this: Window) {
      receivers.push(this);
    };

    try {
      const loop = new FixedStepLoop(() => undefined);
      loop.start();
      loop.pause();
      loop.dispose();

      expect(receivers).toEqual([window, window]);
    } finally {
      window.requestAnimationFrame = originalRequest;
      window.cancelAnimationFrame = originalCancel;
    }
  });

  it('reports each actual animation frame independently of fixed simulation ticks', () => {
    const frames = new Map<number, FrameRequestCallback>();
    let nextId = 1;
    const requestFrame = (callback: FrameRequestCallback) => {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    };
    const cancelFrame = (id: number) => frames.delete(id);
    const loop = new FixedStepLoop(() => undefined, requestFrame, cancelFrame);
    const observeFrame = vi.fn();
    loop.setFrameObserver(observeFrame);

    loop.start();
    frames.get(1)?.(0);
    frames.get(2)?.(8);
    frames.get(3)?.(16);
    expect(observeFrame.mock.calls.map(([timestamp]) => timestamp)).toEqual([0, 8, 16]);
    expect(loop.metrics.tickCount).toBe(0);
    loop.dispose();
  });
});
