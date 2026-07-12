import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { LlmResolver, type LlmModelConfigSource, type LlmPortRegistry } from './llm-resolver.js';
import { FakeLlm } from '../../fakes/core-fakes.js';

describe('LlmResolver', () => {
  it('selects the active adapter by internal role and preserves the port response', async () => {
    const selectedConfigs: unknown[] = [];
    const adapter = new FakeLlm({ intent: 'booking' });
    const configs: LlmModelConfigSource = {
      getActive: (role) =>
        Promise.resolve({
          role,
          provider: 'yandex-ai-studio',
          modelUri: 'gpt://folder-id/deepseek-v4-flash',
          apiKind: 'openai-compatible'
        })
    };
    const adapters: LlmPortRegistry = {
      get: (config) => {
        selectedConfigs.push(config);
        return adapter;
      }
    };
    const resolver = new LlmResolver(configs, adapters);

    const result = await resolver.classify({
      role: 'classify',
      messages: [{ role: 'user', content: 'Нужен столик' }],
      outputSchema: z.strictObject({ intent: z.literal('booking') })
    });

    expect(selectedConfigs).toEqual([
      {
        role: 'classify',
        provider: 'yandex-ai-studio',
        modelUri: 'gpt://folder-id/deepseek-v4-flash',
        apiKind: 'openai-compatible'
      }
    ]);
    expect(result.output).toEqual({ intent: 'booking' });
  });
});
