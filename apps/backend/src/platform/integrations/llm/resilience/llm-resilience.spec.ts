import { describe, expect, it } from 'vitest';
import {
  LlmResilience,
  LlmResilienceError,
  LlmResilienceErrorCode,
  type LlmAttempt,
  type LlmResilienceClock,
  type LlmResilienceSleep
} from './llm-resilience.js';

const MODEL_ID = 'yandexgpt-lite';

function retryableFailure(): LlmResilienceError {
  return new LlmResilienceError(LlmResilienceErrorCode.ProviderUnavailable, true);
}

describe('LlmResilience', () => {
  it('retries an explicitly retryable failure and returns the successful attempt', async () => {
    let calls = 0;
    const sleepCalls: number[] = [];
    const attempt: LlmAttempt<string> = () => {
      calls += 1;
      return calls === 1 ? Promise.reject(retryableFailure()) : Promise.resolve('response');
    };
    const sleep: LlmResilienceSleep = (delayMs) => {
      sleepCalls.push(delayMs);
      return Promise.resolve();
    };
    const resilience = new LlmResilience({
      consecutiveFailureThreshold: 2,
      cooldownMs: 1_000,
      maxAttempts: 2,
      retryDelayMs: 25
    }, sleep);

    await expect(resilience.execute(MODEL_ID, attempt)).resolves.toBe('response');
    expect(calls).toBe(2);
    expect(sleepCalls).toEqual([25]);
  });

  it('does not retry a failure that is not explicitly retryable', async () => {
    let calls = 0;
    const attempt: LlmAttempt<void> = () => {
      calls += 1;
      return Promise.reject(new Error('invalid provider request'));
    };
    const sleep: LlmResilienceSleep = () => Promise.resolve();
    const resilience = new LlmResilience({
      consecutiveFailureThreshold: 2,
      cooldownMs: 1_000,
      maxAttempts: 3,
      retryDelayMs: 25
    }, sleep);

    await expect(resilience.execute(MODEL_ID, attempt)).rejects.toThrow('invalid provider request');
    expect(calls).toBe(1);
  });

  it('does not retain a provider outage count after a non-retryable failure', async () => {
    const sleep: LlmResilienceSleep = () => Promise.resolve();
    const resilience = new LlmResilience({
      consecutiveFailureThreshold: 2,
      cooldownMs: 1_000,
      maxAttempts: 1,
      retryDelayMs: 25
    }, sleep);

    await expect(
      resilience.execute(MODEL_ID, () => Promise.reject(retryableFailure()))
    ).rejects.toMatchObject({ code: LlmResilienceErrorCode.ProviderUnavailable });
    await expect(
      resilience.execute(MODEL_ID, () => Promise.reject(new Error('invalid request')))
    ).rejects.toThrow('invalid request');
    await expect(
      resilience.execute(MODEL_ID, () => Promise.reject(retryableFailure()))
    ).rejects.toMatchObject({ code: LlmResilienceErrorCode.ProviderUnavailable });
  });

  it('fails closed per model once the consecutive failure threshold is reached', async () => {
    let calls = 0;
    const attempt: LlmAttempt<void> = () => {
      calls += 1;
      return Promise.reject(retryableFailure());
    };
    const sleep: LlmResilienceSleep = () => Promise.resolve();
    const resilience = new LlmResilience({
      consecutiveFailureThreshold: 2,
      cooldownMs: 1_000,
      maxAttempts: 1,
      retryDelayMs: 25
    }, sleep);

    await expect(resilience.execute(MODEL_ID, attempt)).rejects.toMatchObject({
      code: LlmResilienceErrorCode.ProviderUnavailable
    });
    await expect(resilience.execute(MODEL_ID, attempt)).rejects.toMatchObject({
      code: LlmResilienceErrorCode.ProviderUnavailable
    });
    await expect(resilience.execute(MODEL_ID, attempt)).rejects.toMatchObject({
      code: LlmResilienceErrorCode.CircuitOpen
    });
    expect(calls).toBe(2);
  });

  it('allows a model to recover after its cooldown expires', async () => {
    let now = 100;
    let calls = 0;
    const clock: LlmResilienceClock = { now: () => now };
    const attempt: LlmAttempt<string> = () => {
      calls += 1;
      return calls === 1 ? Promise.reject(retryableFailure()) : Promise.resolve('recovered');
    };
    const sleep: LlmResilienceSleep = () => Promise.resolve();
    const resilience = new LlmResilience({
      consecutiveFailureThreshold: 1,
      cooldownMs: 1_000,
      maxAttempts: 1,
      retryDelayMs: 25
    }, sleep, clock);

    await expect(resilience.execute(MODEL_ID, attempt)).rejects.toMatchObject({
      code: LlmResilienceErrorCode.ProviderUnavailable
    });
    await expect(resilience.execute(MODEL_ID, attempt)).rejects.toMatchObject({
      code: LlmResilienceErrorCode.CircuitOpen
    });

    now += 1_000;

    await expect(resilience.execute(MODEL_ID, attempt)).resolves.toBe('recovered');
    expect(calls).toBe(2);
  });
});
