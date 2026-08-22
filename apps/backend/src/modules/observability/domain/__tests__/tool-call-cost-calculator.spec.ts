import { describe, expect, it } from 'vitest';
import { costFromLlmUsage } from '../tool-call-cost-calculator.js';

describe('costFromLlmUsage', () => {
  it('prices a known model from its input/output token rate', () => {
    const cost = costFromLlmUsage(
      { inputTokens: 1000, outputTokens: 1000, cachedTokens: 0 },
      'yandexgpt/latest'
    );
    expect(cost).toEqual({ amount: '0.80', currency: 'RUB' });
  });

  it('excludes cached tokens from the billable input', () => {
    const cost = costFromLlmUsage(
      { inputTokens: 1000, outputTokens: 0, cachedTokens: 400 },
      'yandexgpt/latest'
    );
    expect(cost).toEqual({ amount: '0.12', currency: 'RUB' });
  });

  it('falls back to a default rate for an unlisted model', () => {
    const cost = costFromLlmUsage(
      { inputTokens: 1000, outputTokens: 0, cachedTokens: 0 },
      'some-future-model/v3'
    );
    expect(cost).toEqual({ amount: '0.20', currency: 'RUB' });
  });

  it('never returns a negative amount when cached exceeds input', () => {
    const cost = costFromLlmUsage(
      { inputTokens: 100, outputTokens: 0, cachedTokens: 500 },
      'yandexgpt/latest'
    );
    expect(cost).toEqual({ amount: '0.00', currency: 'RUB' });
  });
});
