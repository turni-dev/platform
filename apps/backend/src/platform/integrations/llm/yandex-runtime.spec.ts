import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { LlmResilience } from './resilience/llm-resilience.js';
import { createYandexLlmRuntime } from './yandex-runtime.js';

describe('createYandexLlmRuntime', () => {
  it('routes an OpenAI-compatible Yandex model configuration through one provider runtime', async () => {
    const fetch: typeof globalThis.fetch = () =>
      Promise.resolve(new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"intent":"booking"}' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 }
        })
      ));
    const runtime = createYandexLlmRuntime({
      apiKey: 'test-api-key',
      folderId: 'folder-id',
      database: {
        execute: () =>
          Promise.resolve([
            {
              role: 'classify',
              provider: 'yandex-ai-studio',
              api_kind: 'openai-compatible',
              model_uri: 'gpt://folder-id/deepseek-v4-flash'
            }
          ])
      },
      fetch
    });

    await expect(
      runtime.classify({
        role: 'classify',
        messages: [{ role: 'user', content: 'Нужен столик' }],
        outputSchema: z.strictObject({ intent: z.literal('booking') })
      })
    ).resolves.toMatchObject({ model: 'gpt://folder-id/deepseek-v4-flash' });
  });

  it('retries a retryable provider failure on the composed runtime path', async () => {
    let calls = 0;
    const fetch: typeof globalThis.fetch = () => {
      calls += 1;
      if (calls === 1) {
        return Promise.resolve(new Response('unavailable', { status: 503 }));
      }

      return Promise.resolve(new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"intent":"booking"}' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 }
        })
      ));
    };
    const runtime = createYandexLlmRuntime({
      apiKey: 'test-api-key',
      folderId: 'folder-id',
      database: {
        execute: () =>
          Promise.resolve([
            {
              role: 'classify',
              provider: 'yandex-ai-studio',
              api_kind: 'openai-compatible',
              model_uri: 'gpt://folder-id/deepseek-v4-flash'
            }
          ])
      },
      fetch,
      resilience: new LlmResilience(
        {
          consecutiveFailureThreshold: 2,
          cooldownMs: 60_000,
          maxAttempts: 2,
          retryDelayMs: 0
        },
        () => Promise.resolve()
      )
    });

    await expect(
      runtime.classify({
        role: 'classify',
        messages: [{ role: 'user', content: 'Нужен столик' }],
        outputSchema: z.strictObject({ intent: z.literal('booking') })
      })
    ).resolves.toMatchObject({ model: 'gpt://folder-id/deepseek-v4-flash' });
    expect(calls).toBe(2);
  });
});
