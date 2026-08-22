export type PolicyVerdict =
  | 'auto'
  | 'approval'
  | 'escalate_human'
  | 'out_of_kb'
  | 'refuse';

export interface PolicyInput {
  readonly text: string;
}

export interface PolicyOutcome {
  readonly verdict: PolicyVerdict;
  readonly riskScore: number;
  readonly locked: boolean;
  readonly rule: string;
}

interface PolicyGuard {
  readonly rule: string;
  readonly verdict: PolicyVerdict;
  readonly riskScore: number;
  readonly locked: boolean;
  readonly matches: (normalizedText: string) => boolean;
}

const LOCKED_APPROVAL_GUARDS: readonly PolicyGuard[] = Object.freeze(
  LOCKED_POLICY_SEEDS.map((seed) => {
    const rule = compilePolicyRule(seed);
    return Object.freeze({
      rule: rule.id,
      verdict: rule.verdict,
      riskScore: rule.riskScore,
      locked: rule.locked,
      matches: rule.matches
    });
  })
);

const NON_LOCKED_GUARDS: readonly PolicyGuard[] = Object.freeze([
  {
    rule: 'human-request',
    verdict: 'escalate_human',
    riskScore: 7,
    locked: false,
    matches: (text) => /позовите|пригласите|оператор\S*|человек\S*|сотрудник\S*|администратор\S*/u.test(text)
  },
  {
    rule: 'spam-or-non-guest',
    verdict: 'refuse',
    riskScore: 6,
    locked: false,
    matches: (text) =>
      /купить подписчик\S*|накрут\S*|заработ\S* без вложен|выгодн\S* предложени\S*.*https?:\/\/|https?:\/\/\S*.*реклам/u.test(
        text
      )
  }
]);

export const VERDICT_PRIORITY: Readonly<Record<PolicyVerdict, number>> = Object.freeze({
  approval: 5,
  escalate_human: 4,
  refuse: 3,
  out_of_kb: 2,
  auto: 1
});

function compareGuards(left: PolicyGuard, right: PolicyGuard): number {
  if (left.riskScore !== right.riskScore) {
    return right.riskScore - left.riskScore;
  }
  if (left.locked !== right.locked) {
    return Number(right.locked) - Number(left.locked);
  }
  if (left.verdict !== right.verdict) {
    return VERDICT_PRIORITY[right.verdict] - VERDICT_PRIORITY[left.verdict];
  }
  return left.rule.localeCompare(right.rule, 'ru');
}

function toOutcome(guard: PolicyGuard): PolicyOutcome {
  return Object.freeze({
    verdict: guard.verdict,
    riskScore: guard.riskScore,
    locked: guard.locked,
    rule: guard.rule
  });
}

const DEFAULT_DENY_OUTCOME: PolicyOutcome = Object.freeze({
  verdict: 'approval',
  riskScore: 7,
  locked: false,
  rule: 'unknown-or-incomplete'
});

export class PolicyEngine {
  public evaluate(input: PolicyInput): PolicyOutcome {
    const normalizedText = input.text.trim().toLocaleLowerCase('ru-RU');
    const matchedGuards = [...LOCKED_APPROVAL_GUARDS, ...NON_LOCKED_GUARDS]
      .filter((guard) => guard.matches(normalizedText))
      .sort(compareGuards);

    const selectedGuard = matchedGuards[0];
    return selectedGuard === undefined ? DEFAULT_DENY_OUTCOME : toOutcome(selectedGuard);
  }
}
import { LOCKED_POLICY_SEEDS } from './locked-policy-seeds.js';
import { compilePolicyRule } from './policy-rule-format.js';
