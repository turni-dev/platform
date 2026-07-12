import { DatabaseModelConfigSource, type ModelConfigDatabase } from './model-config-source.js';
import { LlmPortRegistry } from './llm-port-registry.js';
import { LlmResolver } from './llm-resolver.js';
import { YandexOpenAiTextAdapter } from './yandex-openai/yandex-openai-text.adapter.js';
import { YandexGptTextAdapter } from './yandexgpt/yandexgpt-text.adapter.js';

export type YandexLlmRuntimeConfig = Readonly<{
  apiKey: string;
  folderId: string;
  database: ModelConfigDatabase;
  fetch: typeof globalThis.fetch;
}>;

export function createYandexLlmRuntime(config: YandexLlmRuntimeConfig): LlmResolver {
  const adapters = new LlmPortRegistry([
    {
      provider: 'yandex-ai-studio',
      apiKind: 'openai-compatible',
      create: (model) =>
        new YandexOpenAiTextAdapter(
          {
            apiKey: config.apiKey,
            folderId: config.folderId,
            modelUri: model.modelUri
          },
          (url, init) => config.fetch(url, init)
        )
    },
    {
      provider: 'yandex-ai-studio',
      apiKind: 'native',
      create: (model) =>
        new YandexGptTextAdapter(
          {
            baseUrl: 'https://llm.api.cloud.yandex.net',
            apiKey: config.apiKey,
            modelUri: model.modelUri
          },
          (url, init) => config.fetch(url, init)
        )
    }
  ]);

  return new LlmResolver(new DatabaseModelConfigSource(config.database), adapters);
}
