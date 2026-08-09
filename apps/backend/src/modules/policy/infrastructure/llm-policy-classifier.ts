import type { LlmPort } from '@turni/llm';
import {
  policyClassifierInputSchema,
  policyClassifierResultSchema,
  type PolicyClassifierInput,
  type PolicyClassifierPort,
  type PolicyClassifierResult
} from '../application/policy-classifier.port.js';

export class LlmPolicyClassifier implements PolicyClassifierPort {
  public constructor(private readonly llm: LlmPort) {}

  public async classify(input: PolicyClassifierInput): Promise<PolicyClassifierResult> {
    const validatedInput = policyClassifierInputSchema.parse(input);
    const response = await this.llm.classify({
      role: 'classify',
      messages: [{ role: 'user', content: validatedInput.text }],
      outputSchema: policyClassifierResultSchema
    });

    return policyClassifierResultSchema.parse(response.output);
  }
}
