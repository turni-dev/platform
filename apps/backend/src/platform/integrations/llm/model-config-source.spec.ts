import { describe, expect, it } from 'vitest';
import { DatabaseModelConfigSource } from './model-config-source.js';

describe('DatabaseModelConfigSource', () => {
  it('maps an active provider-aware database row to resolver configuration', async () => {
    const source = new DatabaseModelConfigSource({
      execute: () =>
        Promise.resolve([
          {
            role: 'generate',
            provider: 'yandex-ai-studio',
            api_kind: 'openai-compatible',
            model_uri: 'gpt://folder-id/qwen3-235b-a22b-fp8'
          }
        ])
    });

    await expect(source.getActive('generate')).resolves.toEqual({
      role: 'generate',
      provider: 'yandex-ai-studio',
      apiKind: 'openai-compatible',
      modelUri: 'gpt://folder-id/qwen3-235b-a22b-fp8'
    });
  });

  it('fails closed when an active configuration is absent', async () => {
    const source = new DatabaseModelConfigSource({
      execute: () => Promise.resolve([])
    });

    await expect(source.getActive('judge')).rejects.toThrow('Active model configuration not found');
  });
});
