import { describe, expect, it } from 'vitest';
import type {
  LlmPort,
  LlmResponse,
  StructuredLlmRequest
} from '@turni/llm';
import type { z } from 'zod';
import { LlmPolicyClassifier } from '../llm-policy-classifier.js';
import { policyClassifierResultSchema } from '../../application/policy-classifier.port.js';

class RecordingLlm implements LlmPort {
  public request: StructuredLlmRequest<z.ZodType> | undefined;

  public constructor(private readonly output: unknown) {}

  public generate<TSchema extends z.ZodType>(
    request: StructuredLlmRequest<TSchema>
  ): Promise<LlmResponse<z.output<TSchema>>> {
    void request;
    return Promise.reject(new Error('generate is not expected'));
  }

  public classify<TSchema extends z.ZodType>(
    request: StructuredLlmRequest<TSchema>
  ): Promise<LlmResponse<z.output<TSchema>>> {
    this.request = request;
    return Promise.resolve({
      output: this.output as z.output<TSchema>,
      model: 'fake-classifier',
      usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 }
    });
  }
}

describe('LlmPolicyClassifier', () => {
  it('calls the injected LLM classifier with the policy result schema', async () => {
    const llm = new RecordingLlm({
      confidence: 0.9,
      candidates: [{ verdict: 'auto', riskScore: 1, rule: 'faq' }]
    });
    const classifier = new LlmPolicyClassifier(llm);

    await expect(classifier.classify({ text: 'Когда вы открываетесь?' })).resolves.toEqual({
      confidence: 0.9,
      candidates: [{ verdict: 'auto', riskScore: 1, rule: 'faq' }]
    });

    expect(llm.request).toMatchObject({
      role: 'classify',
      messages: [{ role: 'user', content: 'Когда вы открываетесь?' }]
    });
    expect(llm.request?.outputSchema).toBe(policyClassifierResultSchema);
  });

  it('rejects malformed model output', async () => {
    const classifier = new LlmPolicyClassifier(
      new RecordingLlm({ confidence: 0.9, candidates: [{ verdict: 'auto', riskScore: 11 }] })
    );

    await expect(classifier.classify({ text: 'Когда вы открываетесь?' })).rejects.toThrow();
  });
});
