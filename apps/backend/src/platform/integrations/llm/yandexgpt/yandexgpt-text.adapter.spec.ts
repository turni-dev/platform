import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { YandexGptTextAdapter } from './yandexgpt-text.adapter.js';

const YANDEX_COMPLETION_URL =
  'https://llm.api.cloud.yandex.net/foundationModels/v1/completion';
const CORRELATION_ID = '87654321-4321-4321-8321-123456789abc';

describe('YandexGptTextAdapter', () => {
  it('sends a native completion request with disabled data logging and validates structured JSON output', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            result: {
              alternatives: [
                {
                  message: {
                    role: 'assistant',
                    text: '{"intent":"booking"}'
                  },
                  status: 'ALTERNATIVE_STATUS_FINAL'
                }
              ],
              usage: {
                inputTextTokens: 11,
                completionTokens: 3,
                totalTokens: 14
              }
            }
          })
        )
    });
    const adapter = new YandexGptTextAdapter(
      {
        baseUrl: 'https://llm.api.cloud.yandex.net',
        apiKey: 'test-api-key',
        modelUri: 'gpt://folder-id/yandexgpt-lite'
      },
      fetch
    );

    const result = await adapter.classify({
      role: 'classify',
      correlationId: CORRELATION_ID,
      messages: [{ role: 'user', content: 'Нужен столик' }],
      outputSchema: z.strictObject({ intent: z.literal('booking') })
    });

    expect(fetch).toHaveBeenCalledWith(YANDEX_COMPLETION_URL, {
      method: 'POST',
      headers: {
        Authorization: 'Api-Key test-api-key',
        'Content-Type': 'application/json',
        'X-Data-Logging-Enabled': 'false',
        'X-Client-Request-Id': CORRELATION_ID
      },
      body: JSON.stringify({
        modelUri: 'gpt://folder-id/yandexgpt-lite',
        completionOptions: {
          stream: false
        },
        jsonObject: true,
        messages: [{ role: 'user', text: 'Нужен столик' }]
      })
    });
    expect(result).toEqual({
      output: { intent: 'booking' },
      model: 'gpt://folder-id/yandexgpt-lite',
      usage: { inputTokens: 11, outputTokens: 3, cachedTokens: 0 }
    });
  });

  it('fails closed when the provider returns a non-success response without exposing its body', async () => {
    const adapter = new YandexGptTextAdapter(
      {
        baseUrl: 'https://llm.api.cloud.yandex.net',
        apiKey: 'test-api-key',
        modelUri: 'gpt://folder-id/yandexgpt-lite'
      },
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('provider diagnostic containing a secret')
      })
    );

    await expect(
      adapter.generate({
        role: 'generate',
        messages: [{ role: 'user', content: 'Составь ответ' }],
        outputSchema: z.strictObject({ answer: z.string() })
      })
    ).rejects.toThrow('YandexGPT request failed');
    await expect(
      adapter.generate({
        role: 'generate',
        messages: [{ role: 'user', content: 'Составь ответ' }],
        outputSchema: z.strictObject({ answer: z.string() })
      })
    ).rejects.not.toThrow('provider diagnostic containing a secret');
    await expect(
      adapter.generate({
        role: 'generate',
        messages: [{ role: 'user', content: 'Составь ответ' }],
        outputSchema: z.strictObject({ answer: z.string() })
      })
    ).rejects.toMatchObject({
      code: 'llm_provider_unavailable',
      retryable: true
    });
  });

  it('fails closed when the returned structured output does not match the caller schema', async () => {
    const adapter = new YandexGptTextAdapter(
      {
        baseUrl: 'https://llm.api.cloud.yandex.net',
        apiKey: 'test-api-key',
        modelUri: 'gpt://folder-id/yandexgpt-lite'
      },
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              result: {
                alternatives: [
                  {
                    message: { role: 'assistant', text: '{"intent":"other"}' },
                    status: 'ALTERNATIVE_STATUS_FINAL'
                  }
                ],
                usage: {
                  inputTextTokens: 1,
                  completionTokens: 1,
                  totalTokens: 2
                }
              }
            })
          )
      })
    );

    await expect(
      adapter.classify({
        role: 'classify',
        messages: [{ role: 'user', content: 'Нужен столик' }],
        outputSchema: z.strictObject({ intent: z.literal('booking') })
      })
    ).rejects.toThrow('YandexGPT response validation failed');
  });
});
