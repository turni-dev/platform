export interface ExponentialBackoffOptions {
  initialDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
  random?: () => number;
}

export class ExponentialBackoff {
  private attempts = 0;

  private readonly random: () => number;

  public constructor(private readonly options: ExponentialBackoffOptions) {
    this.random = options.random ?? Math.random;
  }

  public nextDelay(): number | null {
    if (this.attempts >= this.options.maxAttempts) {
      return null;
    }

    const exponent = this.attempts;
    this.attempts += 1;
    const delay = Math.min(this.options.initialDelayMs * 2 ** exponent, this.options.maxDelayMs);
    const jitter = 0.5 + this.random();

    return Math.round(delay * jitter);
  }

  public reset(): void {
    this.attempts = 0;
  }
}
