import {
  policyClassifierInputSchema,
  policyClassifierResultSchema,
  type PolicyClassifierCandidate,
  type PolicyClassifierPort
} from './policy-classifier.port.js';
import type {
  PolicyEngine,
  PolicyInput,
  PolicyOutcome,
  PolicyVerdict
} from '../domain/policy-engine.js';

const MINIMUM_CONFIDENCE = 0.8;
const DEFAULT_DENY_RULE = 'unknown-or-incomplete';
const DEFAULT_DENY_OUTCOME: PolicyOutcome = Object.freeze({
  verdict: 'approval',
  riskScore: 7,
  locked: false,
  rule: DEFAULT_DENY_RULE
});

const VERDICT_PRIORITY: Readonly<Record<PolicyVerdict, number>> = Object.freeze({
  approval: 5,
  escalate_human: 4,
  refuse: 3,
  out_of_kb: 2,
  auto: 1
});

function compareCandidates(left: PolicyClassifierCandidate, right: PolicyClassifierCandidate): number {
  if (left.riskScore !== right.riskScore) {
    return right.riskScore - left.riskScore;
  }

  if (left.verdict !== right.verdict) {
    return VERDICT_PRIORITY[right.verdict] - VERDICT_PRIORITY[left.verdict];
  }

  return left.rule.localeCompare(right.rule, 'ru');
}

function toOutcome(candidate: PolicyClassifierCandidate): PolicyOutcome {
  return Object.freeze({
    verdict: candidate.verdict,
    riskScore: candidate.riskScore,
    locked: false,
    rule: candidate.rule
  });
}

export class PolicyCascade {
  public constructor(
    private readonly l0: PolicyEngine,
    private readonly l1: PolicyClassifierPort,
    private readonly l2: PolicyClassifierPort
  ) {}

  public async evaluate(input: PolicyInput): Promise<PolicyOutcome> {
    const l0Outcome = this.l0.evaluate(input);
    if (l0Outcome.rule !== DEFAULT_DENY_RULE) {
      return l0Outcome;
    }

    try {
      const classifierInput = policyClassifierInputSchema.parse(input);
      const l1Result = policyClassifierResultSchema.parse(await this.l1.classify(classifierInput));

      if (l1Result.confidence >= MINIMUM_CONFIDENCE) {
        return this.reduce(l1Result.candidates);
      }

      const l2Result = policyClassifierResultSchema.parse(await this.l2.classify(classifierInput));
      if (l2Result.confidence < MINIMUM_CONFIDENCE) {
        return DEFAULT_DENY_OUTCOME;
      }

      return this.reduce(l2Result.candidates);
    } catch {
      return DEFAULT_DENY_OUTCOME;
    }
  }

  private reduce(candidates: readonly PolicyClassifierCandidate[]): PolicyOutcome {
    const highestRisk = [...candidates].sort(compareCandidates)[0];
    return highestRisk === undefined ? DEFAULT_DENY_OUTCOME : toOutcome(highestRisk);
  }
}
