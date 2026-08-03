import { describe, expect, it } from 'vitest';

import { ExponentialBackoff } from './backoff.js';

describe('ExponentialBackoff', () => {
  it('caps retry delays and stops after the configured attempt limit', () => {
    const backoff = new ExponentialBackoff({
      initialDelayMs: 100,
      maxDelayMs: 250,
      maxAttempts: 3,
      random: () => 0.5
    });

    expect(backoff.nextDelay()).toBe(100);
    expect(backoff.nextDelay()).toBe(200);
    expect(backoff.nextDelay()).toBe(250);
    expect(backoff.nextDelay()).toBeNull();
  });

  it('starts a new reconnect cycle after reset', () => {
    const backoff = new ExponentialBackoff({
      initialDelayMs: 100,
      maxDelayMs: 500,
      maxAttempts: 1,
      random: () => 0.5
    });

    backoff.nextDelay();
    expect(backoff.nextDelay()).toBeNull();

    backoff.reset();
    expect(backoff.nextDelay()).toBe(100);
  });
});
