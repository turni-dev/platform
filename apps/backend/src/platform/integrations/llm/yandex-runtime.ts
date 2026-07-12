import { DatabaseModelConfigSource, type ModelConfigDatabase } from './model-config-source.js';
import { LlmPortRegistry } from './llm-port-registry.js';
import { LlmResolver } from './llm-resolver.js';
import { LlmResilience } from './resilience/llm-resilience.js';
import { ResilientLlmPort } from './resilience/resilient-llm-port.js';
import { YandexOpenAiTextAdapter } from './yandex-openai/yandex-openai-text.adapter.js';
import { YandexGptTextAdapter } from './yandexgpt/yandexgpt-text.adapter.js';

export type YandexLlmRuntimeConfig = Readonly<{
  apiKey: string;
  folderId: string;
  database: ModelConfigDatabase;
  fetch: typeof globalThis.fetch;
  resilience?: LlmResilience;
}>;

const DEFAULT_RESILIENCE_CONFIG = {
  consecutiveFailureThreshold: 3,
  cooldownMs: 30_000,
  maxAttempts: 3,
  retryDelayMs: 250
} as const;

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export function createYandexLlmRuntime(config: YandexLlmRuntimeConfig): LlmResolver {
  const resilience =
    config.resilience ?? new LlmResilience(DEFAULT_RESILIENCE_CONFIG, sleep);
  const adapters = new LlmPortRegistry([
    {
      provider: 'yandex-ai-studio',
      apiKind: 'openai-compatible',
      create: (model) =>
        new ResilientLlmPort(
          new YandexOpenAiTextAdapter(
          {
            apiKey: config.apiKey,
            folderId: config.folderId,
            modelUri: model.modelUri
          },
          (url, init) => config.fetch(url, init)
          ),
          `${model.provider}:${model.modelUri}`,
          resilience
        )
    },
    {
      provider: 'yandex-ai-studio',
      apiKind: 'native',
      create: (model) =>
        new ResilientLlmPort(
          new YandexGptTextAdapter(
          {
            baseUrl: 'https://llm.api.cloud.yandex.net',
            apiKey: config.apiKey,
            modelUri: model.modelUri
          },
          (url, init) => config.fetch(url, init)
          ),
          `${model.provider}:${model.modelUri}`,
          resilience
        )
    }
  ]);

  return new LlmResolver(new DatabaseModelConfigSource(config.database), adapters);
}
