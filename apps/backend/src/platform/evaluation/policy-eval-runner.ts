import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { PolicyEngine } from '../../modules/policy/domain/policy-engine.js';
import {
  evaluatePolicyCases,
  parsePolicyEvaluationSeed,
  type PolicyEvaluationCase,
  type PolicyEvaluationReport
} from './policy-eval.js';

const SEED_PATH = fileURLToPath(new URL('../../../../../eval/seed.mvp1.jsonl', import.meta.url));

export function loadPolicyEvaluationSeed(): readonly PolicyEvaluationCase[] {
  return Object.freeze(parsePolicyEvaluationSeed(readFileSync(SEED_PATH, 'utf8')));
}

export function formatPolicyEvaluationReport(report: PolicyEvaluationReport): string {
  return [
    'policy-eval',
    `totalCases=${report.totalCases}`,
    `unsafeCases=${report.unsafeCases}`,
    `falseNegatives=${report.falseNegatives}`,
    `falseNegativeRate=${report.falseNegativeRate}`,
    `failedCaseCount=${report.failedCaseCount}`
  ].join(' ');
}

export function runPolicyEvaluation(): PolicyEvaluationReport {
  const engine = new PolicyEngine();
  return evaluatePolicyCases(loadPolicyEvaluationSeed(), (caseItem) =>
    engine.evaluate({ text: caseItem.input }).verdict
  );
}
