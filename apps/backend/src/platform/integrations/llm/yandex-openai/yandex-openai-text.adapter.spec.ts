import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { YandexOpenAiTextAdapter } from './yandex-openai-text.adapter.js';

const OPENAI_COMPLETION_URL = 'https://ai.api.cloud.yandex.net/v1/chat/completions';
const FOLDER_ID = 'folder-id';

const response = (content: string) => ({
  ok: true,
  status: 200,
  text: () =>
    Promise.resolve(
      JSON.stringify({
        choices: [{ message: { content } }],
        usage: {
          prompt_tokens: 11,
          completion_tokens: 3,
          prompt_tokens_details: { cached_tokens: 2 }
        }
      })
    )
});

describe('YandexOpenAiTextAdapter', () => {
  it.each([
    'gpt://folder-id/deepseek-v4-flash',
    'gpt://folder-id/qwen3-235b-a22b-fp8'
  ])('uses the explicit %s model URI through the OpenAI-compatible endpoint', async (modelUri) => {
    const fetch = vi.fn().mockResolvedValue(response('{"intent":"booking"}'));
    const adapter = new YandexOpenAiTextAdapter(
      { apiKey: 'test-api-key', folderId: FOLDER_ID, modelUri },
      fetch
    );

    const result = await adapter.classify({
      role: 'classify',
      messages: [{ role: 'user', content: 'Нужен столик' }],
      outputSchema: z.strictObject({ intent: z.literal('booking') })
    });

    expect(fetch).toHaveBeenCalledWith(OPENAI_COMPLETION_URL, {
      method: 'POST',
      headers: {
        Authorization: 'Api-Key test-api-key',
        'OpenAI-Project': FOLDER_ID,
        'Content-Type': 'application/json',
        'X-Data-Logging-Enabled': 'false'
      },
      body: JSON.stringify({
        model: modelUri,
        messages: [{ role: 'user', content: 'Нужен столик' }],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'structured_output',
            strict: true,
            schema: {
              type: 'object',
              properties: { intent: { type: 'string', const: 'booking' } },
              required: ['intent'],
              additionalProperties: false
            }
          }
        }
      })
    });
    expect(result).toEqual({
      output: { intent: 'booking' },
      model: modelUri,
      usage: { inputTokens: 11, outputTokens: 3, cachedTokens: 2 }
    });
  });

  it('fails closed without exposing a provider error body', async () => {
    const adapter = new YandexOpenAiTextAdapter(
      {
        apiKey: 'test-api-key',
        folderId: FOLDER_ID,
        modelUri: 'gpt://folder-id/deepseek-v4-flash'
      },
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('provider diagnostic with a secret')
      })
    );

    const request = {
      role: 'generate' as const,
      messages: [{ role: 'user' as const, content: 'Составь ответ' }],
      outputSchema: z.strictObject({ answer: z.string() })
    };

    await expect(adapter.generate(request)).rejects.toThrow('Yandex OpenAI request failed');
    await expect(adapter.generate(request)).rejects.not.toThrow(
      'provider diagnostic with a secret'
    );
  });
});
