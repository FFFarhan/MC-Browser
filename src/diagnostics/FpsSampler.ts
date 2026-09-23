const WINDOW_MILLISECONDS = 1_000;
const MAX_SAMPLE_GAP_MILLISECONDS = 2_000;

export class FpsSampler {
  private lastTimestamp: number | null = null;
  private windowStart: number | null = null;
  private frameCount = 0;

  addFrame(timestampMs: number): number | null {
    if (!Number.isFinite(timestampMs) || timestampMs < 0)
      throw new RangeError('Frame timestamp must be finite and non-negative');
    if (this.lastTimestamp !== null && timestampMs < this.lastTimestamp) {
      this.reset();
      this.beginWindow(timestampMs);
      return null;
    }
    if (
      this.lastTimestamp !== null &&
      timestampMs - this.lastTimestamp > MAX_SAMPLE_GAP_MILLISECONDS
    ) {
      this.beginWindow(timestampMs);
      return null;
    }
    if (this.lastTimestamp === null) {
      this.beginWindow(timestampMs);
      return null;
    }

    this.lastTimestamp = timestampMs;
    this.frameCount += 1;
    const elapsed = timestampMs - (this.windowStart ?? timestampMs);
    if (elapsed < WINDOW_MILLISECONDS) return null;
    const framesPerSecond = Math.round((this.frameCount * 1_000) / elapsed);
    this.windowStart = timestampMs;
    this.frameCount = 0;
    return framesPerSecond;
  }

  reset(): void {
    this.lastTimestamp = null;
    this.windowStart = null;
    this.frameCount = 0;
  }

  private beginWindow(timestampMs: number): void {
    this.lastTimestamp = timestampMs;
    this.windowStart = timestampMs;
    this.frameCount = 0;
  }
}
