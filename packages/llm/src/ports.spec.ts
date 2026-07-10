import { z } from 'zod';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  EmbeddingRequestSchema,
  EmbeddingResponseSchema,
  type LlmPort,
  LlmRequestSchema,
  type LlmResponse
} from './index.js';

describe('LLM port contracts', () => {
  it('routes by internal role without provider or model slugs', () => {
    expect(
      LlmRequestSchema.parse({
        role: 'generate',
        messages: [{ role: 'user', content: 'Ответь гостю' }]
      }).role
    ).toBe('generate');
    expect(() =>
      LlmRequestSchema.parse({
        role: 'generate',
        provider: 'gigachat',
        messages: [{ role: 'user', content: 'Ответь гостю' }]
      })
    ).toThrow();
  });

  it('preserves structured output types', () => {
    const outputSchema = z.strictObject({ intent: z.literal('booking') });
    type Output = z.infer<typeof outputSchema>;
    const generate = (port: LlmPort) =>
      port.generate({
        role: 'classify',
        messages: [{ role: 'user', content: 'Хочу столик' }],
        outputSchema
      });

    expectTypeOf(generate)
      .returns.toMatchTypeOf<Promise<LlmResponse<Output>>>();
  });

  it('requires non-empty embedding batches', () => {
    expect(
      EmbeddingRequestSchema.parse({ texts: ['Меню', 'Стоп-лист'] }).texts
    ).toHaveLength(2);
    expect(() => EmbeddingRequestSchema.parse({ texts: [] })).toThrow();
  });

  it('enforces vector(768) at the port boundary', () => {
    expect(() =>
      EmbeddingResponseSchema.parse({
        model: 'test-model',
        vectors: [[0.1, 0.2]]
      })
    ).toThrow();
  });
});
