import { describe, expect, it } from 'vitest';
import {
  YandexEmbeddingAdapter,
  type FetchLike
} from './yandex-embedding.js';

const EMBEDDING_MODEL_URI = 'emb://folder-id/text-embeddings-v2-doc/latest';
const API_KEY = 'test-api-key';

function responseWith(vector: number): Response {
  return new Response(JSON.stringify({ embedding: Array(768).fill(vector) }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

describe('YandexEmbeddingAdapter', () => {
  it('embeds each text in request order with the configured 768-dimensional model', async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetch: FetchLike = (url, init) => {
      requests.push({ url: String(url), init });
      if (typeof init?.body !== 'string') {
        throw new Error('Expected JSON request body');
      }
      const body = JSON.parse(init.body) as { text: string };
      return Promise.resolve(responseWith(body.text === 'first' ? 1 : 2));
    };
    const adapter = new YandexEmbeddingAdapter({
      apiKey: API_KEY,
      modelUri: EMBEDDING_MODEL_URI,
      fetch
    });

    const result = await adapter.embed({ texts: ['first', 'second'] });

    expect(result).toEqual({
      model: EMBEDDING_MODEL_URI,
      vectors: [Array(768).fill(1), Array(768).fill(2)]
    });
    expect(requests).toEqual([
      {
        url: 'https://llm.api.cloud.yandex.net/foundationModels/v1/textEmbedding',
        init: {
          method: 'POST',
          headers: {
            authorization: `Api-Key ${API_KEY}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            modelUri: EMBEDDING_MODEL_URI,
            text: 'first',
            dim: '768'
          })
        }
      },
      {
        url: 'https://llm.api.cloud.yandex.net/foundationModels/v1/textEmbedding',
        init: {
          method: 'POST',
          headers: {
            authorization: `Api-Key ${API_KEY}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            modelUri: EMBEDDING_MODEL_URI,
            text: 'second',
            dim: '768'
          })
        }
      }
    ]);
  });

  it('fails closed when Yandex returns an invalid embedding without exposing its body', async () => {
    const fetch: FetchLike = () =>
      Promise.resolve(
        new Response(JSON.stringify({ embedding: [1], details: 'private-body' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      );
    const adapter = new YandexEmbeddingAdapter({
      apiKey: API_KEY,
      modelUri: EMBEDDING_MODEL_URI,
      fetch
    });

    const error = await adapter
      .embed({ texts: ['first'] })
      .then(() => undefined)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Yandex embedding request failed');
    expect((error as Error).message).not.toContain('private-body');
  });
});
