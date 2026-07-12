import { describe, expect, it } from 'vitest';
import { FakeLlm } from '../../fakes/core-fakes.js';
import { LlmPortRegistry } from './llm-port-registry.js';

describe('LlmPortRegistry', () => {
  it('selects an adapter factory by provider and API kind without inspecting the model URI', () => {
    const adapter = new FakeLlm({ intent: 'booking' });
    const registry = new LlmPortRegistry([
      {
        provider: 'yandex-ai-studio',
        apiKind: 'openai-compatible',
        create: () => adapter
      }
    ]);

    expect(
      registry.get({
        role: 'classify',
        provider: 'yandex-ai-studio',
        apiKind: 'openai-compatible',
        modelUri: 'gpt://folder-id/deepseek-v4-flash'
      })
    ).toBe(adapter);
  });

  it('fails closed when no adapter is registered for a provider/API combination', () => {
    const registry = new LlmPortRegistry([]);

    expect(() =>
      registry.get({
        role: 'generate',
        provider: 'gigachat',
        apiKind: 'native',
        modelUri: 'gigachat-2-max'
      })
    ).toThrow('No LLM adapter is registered');
  });
});
