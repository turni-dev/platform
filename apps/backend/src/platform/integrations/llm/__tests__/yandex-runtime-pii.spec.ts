import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { createYandexLlmRuntime } from '../yandex-runtime.js';

describe('createYandexLlmRuntime PII boundary', () => {
  it('redacts vendor-bound messages and restores the provider response', async () => {
    let vendorRequestBody = '';
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
      fetch: (_url, init) => {
        vendorRequestBody = typeof init?.body === 'string' ? init.body : '';
        return Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      reply: 'Подтверждаем: [[TURNI_PII:EMAIL:1]]'
                    })
                  }
                }
              ],
              usage: { prompt_tokens: 1, completion_tokens: 1 }
            })
          )
        );
      }
    });

    const result = await runtime.classify({
      role: 'classify',
      messages: [{ role: 'user', content: 'Моя почта alice@example.com' }],
      outputSchema: z.strictObject({ reply: z.string() })
    });

    expect(vendorRequestBody).not.toContain('alice@example.com');
    expect(vendorRequestBody).toContain('[[TURNI_PII:EMAIL:1]]');
    expect(result.output).toEqual({ reply: 'Подтверждаем: alice@example.com' });
  });

  it('redacts messages before the native Yandex provider', async () => {
    let vendorRequestBody = '';
    const runtime = createYandexLlmRuntime({
      apiKey: 'test-api-key',
      folderId: 'folder-id',
      database: {
        execute: () =>
          Promise.resolve([
            {
              role: 'generate',
              provider: 'yandex-ai-studio',
              api_kind: 'native',
              model_uri: 'gpt://folder-id/yandexgpt/latest'
            }
          ])
      },
      fetch: (_url, init) => {
        vendorRequestBody = typeof init?.body === 'string' ? init.body : '';
        return Promise.resolve(
          new Response(
            JSON.stringify({
              result: {
                alternatives: [
                  {
                    message: {
                      role: 'assistant',
                      text: JSON.stringify({
                        reply: 'Позвоним: [[TURNI_PII:PHONE:1]]'
                      })
                    },
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
        );
      }
    });

    const result = await runtime.generate({
      role: 'generate',
      messages: [{ role: 'user', content: 'Перезвоните на +7 999 123-45-67' }],
      outputSchema: z.strictObject({ reply: z.string() })
    });

    expect(vendorRequestBody).not.toContain('+7 999 123-45-67');
    expect(vendorRequestBody).toContain('[[TURNI_PII:PHONE:1]]');
    expect(result.output).toEqual({ reply: 'Позвоним: +7 999 123-45-67' });
  });
});
