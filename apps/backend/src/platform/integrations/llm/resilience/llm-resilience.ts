export const LlmResilienceErrorCode = {
  CircuitOpen: 'llm_circuit_open',
  ProviderUnavailable: 'llm_provider_unavailable',
  InvalidResponse: 'llm_invalid_response'
} as const;

export type LlmResilienceErrorCode =
  (typeof LlmResilienceErrorCode)[keyof typeof LlmResilienceErrorCode];

export class LlmResilienceError extends Error {
  constructor(
    readonly code: LlmResilienceErrorCode,
    readonly retryable: boolean
  ) {
    super(code);
    this.name = 'LlmResilienceError';
  }
}

export type LlmAttempt<T> = () => Promise<T>;
export type LlmResilienceSleep = (delayMs: number) => Promise<void>;

export interface LlmResilienceClock {
  now(): number;
}

export type LlmResilienceConfig = Readonly<{
  consecutiveFailureThreshold: number;
  cooldownMs: number;
  maxAttempts: number;
  retryDelayMs: number;
}>;

type CircuitState = Readonly<{
  consecutiveFailures: number;
  openedAtMs?: number;
}>;

const systemClock: LlmResilienceClock = {
  now: () => Date.now()
};

export class LlmResilience {
  private readonly circuits = new Map<string, CircuitState>();

  constructor(
    private readonly config: LlmResilienceConfig,
    private readonly sleep: LlmResilienceSleep,
    private readonly clock: LlmResilienceClock = systemClock
  ) {
    this.validateConfig();
  }

  async execute<T>(modelId: string, attempt: LlmAttempt<T>): Promise<T> {
    this.assertCircuitAllows(modelId);

    try {
      const response = await this.executeWithRetry(attempt);
      this.circuits.delete(modelId);
      return response;
    } catch (error) {
      if (isExplicitlyRetryable(error)) {
        this.recordFailure(modelId);
      } else {
        this.circuits.delete(modelId);
      }
      throw error;
    }
  }

  private async executeWithRetry<T>(attempt: LlmAttempt<T>): Promise<T> {
    for (let attemptNumber = 1; attemptNumber <= this.config.maxAttempts; attemptNumber += 1) {
      try {
        return await attempt();
      } catch (error) {
        if (!isExplicitlyRetryable(error) || attemptNumber === this.config.maxAttempts) {
          throw error;
        }

        await this.sleep(this.config.retryDelayMs);
      }
    }

    throw new Error('Unreachable retry state');
  }

  private assertCircuitAllows(modelId: string): void {
    const state = this.circuits.get(modelId);
    if (state?.openedAtMs === undefined) {
      return;
    }

    if (this.clock.now() - state.openedAtMs < this.config.cooldownMs) {
      throw new LlmResilienceError(LlmResilienceErrorCode.CircuitOpen, false);
    }

    this.circuits.delete(modelId);
  }

  private recordFailure(modelId: string): void {
    const previous = this.circuits.get(modelId);
    const consecutiveFailures = (previous?.consecutiveFailures ?? 0) + 1;
    if (consecutiveFailures >= this.config.consecutiveFailureThreshold) {
      this.circuits.set(modelId, {
        consecutiveFailures,
        openedAtMs: this.clock.now()
      });
      return;
    }

    this.circuits.set(modelId, { consecutiveFailures });
  }

  private validateConfig(): void {
    if (!Number.isInteger(this.config.consecutiveFailureThreshold) || this.config.consecutiveFailureThreshold < 1) {
      throw new RangeError('consecutiveFailureThreshold must be a positive integer');
    }
    if (!Number.isInteger(this.config.maxAttempts) || this.config.maxAttempts < 1) {
      throw new RangeError('maxAttempts must be a positive integer');
    }
    if (this.config.cooldownMs < 0 || this.config.retryDelayMs < 0) {
      throw new RangeError('resilience delays must not be negative');
    }
  }
}

export function isExplicitlyRetryable(error: unknown): error is LlmResilienceError {
  return error instanceof LlmResilienceError && error.retryable;
}
