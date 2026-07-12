import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { FakeLlm } from '../../../fakes/core-fakes.js';
import { LlmResilience } from './llm-resilience.js';
import { ResilientLlmPort } from './resilient-llm-port.js';

describe('ResilientLlmPort', () => {
  it('runs a port invocation through resilience using the provider/model key', async () => {
    const port = new ResilientLlmPort(
      new FakeLlm({ intent: 'booking' }),
      'yandex-ai-studio:gpt://folder/deepseek-v4-flash',
      new LlmResilience(
        { consecutiveFailureThreshold: 1, cooldownMs: 60_000, maxAttempts: 1, retryDelayMs: 0 },
        () => Promise.resolve()
      )
    );

    await port.classify({
      role: 'classify',
      messages: [{ role: 'user', content: 'Столик' }],
      outputSchema: z.strictObject({ intent: z.literal('booking') })
    });

    expect(
      await port.classify({
        role: 'classify',
        messages: [{ role: 'user', content: 'Столик' }],
        outputSchema: z.strictObject({ intent: z.literal('booking') })
      })
    ).toMatchObject({ output: { intent: 'booking' } });
  });
});
