import {
  EmbeddingRequestSchema,
  EmbeddingResponseSchema,
  EmbeddingVectorSchema,
  type EmbeddingPort,
  type EmbeddingRequest,
  type EmbeddingResponse
} from '@turni/llm';
import { z } from 'zod';

const YANDEX_TEXT_EMBEDDING_URL =
  'https://llm.api.cloud.yandex.net/foundationModels/v1/textEmbedding';
const YANDEX_EMBEDDING_DIMENSION = 768;
const YANDEX_EMBEDDING_FAILURE_MESSAGE = 'Yandex embedding request failed';

const YandexEmbeddingConfigSchema = z.strictObject({
  apiKey: z.string().min(1),
  modelUri: z.string().min(1)
});
const YandexEmbeddingRequestSchema = z.strictObject({
  modelUri: z.string().min(1),
  text: z.string().min(1),
  dim: z.literal(String(YANDEX_EMBEDDING_DIMENSION))
});
const YandexEmbeddingResponseSchema = z.object({
  embedding: EmbeddingVectorSchema
});

export type FetchLike = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

export type YandexEmbeddingConfig = z.infer<
  typeof YandexEmbeddingConfigSchema
> & {
  fetch?: FetchLike;
};

export class YandexEmbeddingAdapter implements EmbeddingPort {
  private readonly apiKey: string;
  private readonly fetch: FetchLike;
  private readonly modelUri: string;

  constructor(config: YandexEmbeddingConfig, fetch?: FetchLike) {
    const { fetch: configuredFetch, ...connectionConfig } = config;
    const parsedConfig = YandexEmbeddingConfigSchema.parse(connectionConfig);
    this.apiKey = parsedConfig.apiKey;
    this.modelUri = parsedConfig.modelUri;
    this.fetch = fetch ?? configuredFetch ?? globalThis.fetch;
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const parsedRequest = EmbeddingRequestSchema.parse(request);
    const vectors: number[][] = [];

    for (const text of parsedRequest.texts) {
      vectors.push(await this.embedText(text));
    }

    return EmbeddingResponseSchema.parse({
      model: this.modelUri,
      vectors
    });
  }

  private async embedText(text: string): Promise<number[]> {
    try {
      const body = YandexEmbeddingRequestSchema.parse({
        modelUri: this.modelUri,
        text,
        dim: String(YANDEX_EMBEDDING_DIMENSION)
      });
      const response = await this.fetch(YANDEX_TEXT_EMBEDDING_URL, {
        method: 'POST',
        headers: {
          authorization: `Api-Key ${this.apiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(YANDEX_EMBEDDING_FAILURE_MESSAGE);
      }

      return YandexEmbeddingResponseSchema.parse(await response.json()).embedding;
    } catch {
      throw new Error(YANDEX_EMBEDDING_FAILURE_MESSAGE);
    }
  }
}
