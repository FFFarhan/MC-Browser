export interface MiningTargetProgress {
  readonly key: string;
  readonly hardnessSeconds: number;
}

export interface MiningProgressState {
  readonly progress: number;
  readonly complete: boolean;
}

const RESET: MiningProgressState = Object.freeze({ progress: 0, complete: false });

export class MiningProgress {
  private targetKey: string | null = null;
  private elapsedSeconds = 0;

  advance(
    target: MiningTargetProgress | null,
    held: boolean,
    deltaSeconds: number,
  ): MiningProgressState {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
      throw new RangeError('Mining frame time must be finite and non-negative');
    if (
      !held ||
      !target ||
      !Number.isFinite(target.hardnessSeconds) ||
      target.hardnessSeconds <= 0
    ) {
      this.cancel();
      return RESET;
    }
    if (!target.key.trim()) throw new RangeError('Mining target key cannot be empty');
    if (target.key !== this.targetKey) {
      this.targetKey = target.key;
      this.elapsedSeconds = 0;
    }
    this.elapsedSeconds = Math.min(target.hardnessSeconds, this.elapsedSeconds + deltaSeconds);
    const complete = this.elapsedSeconds >= target.hardnessSeconds - 1e-9;
    if (complete) this.elapsedSeconds = target.hardnessSeconds;
    const progress = this.elapsedSeconds / target.hardnessSeconds;
    return { progress, complete };
  }

  cancel(): void {
    this.targetKey = null;
    this.elapsedSeconds = 0;
  }
}
