export interface FixedStepMetrics {
  frameCount: number;
  tickCount: number;
  discardedCatchUpFrames: number;
  discardedMilliseconds: number;
}

const DEFAULT_STEP_MS = 1000 / 60;
const MAX_CATCH_UP_STEPS = 5;
const MAX_FRAME_DELTA_MS = 250;

export class FixedStepLoop {
  readonly metrics: FixedStepMetrics = {
    frameCount: 0,
    tickCount: 0,
    discardedCatchUpFrames: 0,
    discardedMilliseconds: 0,
  };

  private running = false;
  private disposed = false;
  private lastTimestamp: number | null = null;
  private accumulatorMs = 0;
  private frameHandle: number | null = null;

  constructor(
    private readonly tick: (stepSeconds: number) => void,
    private readonly requestFrame: (callback: FrameRequestCallback) => number = (callback) =>
      window.requestAnimationFrame(callback),
    private readonly cancelFrame: (handle: number) => void = (handle) =>
      window.cancelAnimationFrame(handle),
    private readonly stepMs = DEFAULT_STEP_MS,
    private readonly maxCatchUpSteps = MAX_CATCH_UP_STEPS,
  ) {
    if (!Number.isFinite(stepMs) || stepMs <= 0) {
      throw new RangeError('stepMs must be a positive finite number');
    }
    if (!Number.isInteger(maxCatchUpSteps) || maxCatchUpSteps < 1) {
      throw new RangeError('maxCatchUpSteps must be a positive integer');
    }
  }

  start(): void {
    this.resume();
  }

  pause(): void {
    if (this.disposed || !this.running) return;
    this.running = false;
    this.lastTimestamp = null;
    this.accumulatorMs = 0;
    this.cancelPendingFrame();
  }

  resume(): void {
    if (this.disposed || this.running) return;
    this.running = true;
    this.lastTimestamp = null;
    this.accumulatorMs = 0;
    this.scheduleFrame();
  }

  dispose(): void {
    if (this.disposed) return;
    this.pause();
    this.disposed = true;
  }

  private scheduleFrame(): void {
    if (!this.running || this.disposed || this.frameHandle !== null) return;
    this.frameHandle = this.requestFrame(this.onFrame);
  }

  private cancelPendingFrame(): void {
    if (this.frameHandle === null) return;
    this.cancelFrame(this.frameHandle);
    this.frameHandle = null;
  }

  private readonly onFrame: FrameRequestCallback = (timestamp) => {
    this.frameHandle = null;
    if (!this.running || this.disposed) return;

    this.metrics.frameCount += 1;
    if (this.lastTimestamp === null) {
      this.lastTimestamp = timestamp;
    } else {
      const rawDelta = Math.max(0, timestamp - this.lastTimestamp);
      const frameDelta = Math.min(rawDelta, MAX_FRAME_DELTA_MS);
      this.lastTimestamp = timestamp;
      this.accumulatorMs += frameDelta;

      let steps = 0;
      while (this.accumulatorMs >= this.stepMs && steps < this.maxCatchUpSteps) {
        this.tick(this.stepMs / 1000);
        this.accumulatorMs -= this.stepMs;
        steps += 1;
        this.metrics.tickCount += 1;
      }

      if (this.accumulatorMs >= this.stepMs) {
        const retainedRemainder = this.accumulatorMs % this.stepMs;
        this.metrics.discardedMilliseconds += this.accumulatorMs - retainedRemainder;
        this.metrics.discardedCatchUpFrames += 1;
        this.accumulatorMs = retainedRemainder;
      }
    }

    this.scheduleFrame();
  };
}
