import {
  policyClassifierInputSchema,
  policyClassifierResultSchema,
  type PolicyClassifierInput,
  type PolicyClassifierPort,
  type PolicyClassifierResult
} from './policy-classifier.port.js';

export class FakePolicyClassifier implements PolicyClassifierPort {
  public readonly calls: PolicyClassifierInput[] = [];

  private readonly responses: PolicyClassifierResult[];

  public constructor(responses: readonly PolicyClassifierResult[] = [], private readonly failure?: Error) {
    this.responses = [...responses];
  }

  public classify(input: PolicyClassifierInput): Promise<PolicyClassifierResult> {
    this.calls.push(policyClassifierInputSchema.parse(input));

    if (this.failure !== undefined) {
      return Promise.reject(this.failure);
    }

    const response = this.responses.shift() ?? { confidence: 1, candidates: [] };
    return Promise.resolve(policyClassifierResultSchema.parse(response));
  }
}
