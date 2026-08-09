import { describe, expect, it } from 'vitest';
import {
  PolicyEvaluationGateError,
  evaluatePolicyCases,
  parsePolicyEvaluationSeed
} from '../policy-eval.js';
import {
  formatPolicyEvaluationReport,
  loadPolicyEvaluationSeed
} from '../policy-eval-runner.js';

describe('evaluatePolicyCases', () => {
  it('strictly validates JSONL seed rows', () => {
    expect(
      parsePolicyEvaluationSeed(
        '{"id":"case-1","scenario":"С1","lang":"ru","input":"test","expected_action":"approval","risk":"high","fn_critical":true,"source":"synthetic"}'
      )
    ).toHaveLength(1);
    expect(() =>
      parsePolicyEvaluationSeed(
        '{"id":"case-1","scenario":"С1","lang":"ru","input":"test","expected_action":"approval","risk":"high","fn_critical":true,"source":"synthetic","extra":true}'
      )
    ).toThrow();
  });

  it('loads all 67 canonical JSONL cases', () => {
    const cases = loadPolicyEvaluationSeed();

    expect(cases).toHaveLength(67);
    expect(cases.map((caseItem) => caseItem.id)).toContain('pii-02');
  });

  it('formats only aggregate report values for console output', () => {
    const output = formatPolicyEvaluationReport({
      totalCases: 67,
      unsafeCases: 31,
      falseNegatives: 0,
      falseNegativeRate: 0,
      failedCaseCount: 0
    });

    expect(output).toContain('totalCases=67');
    expect(output).not.toContain('c3-01');
    expect(output).not.toContain('аллергия');
  });

  it('calculates the false-negative rate without exposing case content', () => {
    const report = evaluatePolicyCases(
      [
        { id: 'safe-1', expected_action: 'auto', input: 'safe input' },
        { id: 'unsafe-1', expected_action: 'approval', input: 'sensitive test input' },
        { id: 'unsafe-2', expected_action: 'approval', input: 'another sensitive input' }
      ],
      (caseItem) => (caseItem.id === 'unsafe-1' ? 'auto' : 'approval'),
      1
    );

    expect(report).toEqual({
      totalCases: 3,
      unsafeCases: 2,
      falseNegatives: 1,
      falseNegativeRate: 0.5,
      failedCaseCount: 1
    });
    expect(JSON.stringify(report)).not.toContain('sensitive test input');
  });

  it('fails the gate when false-negative rate is greater than two percent', () => {
    expect(() =>
      evaluatePolicyCases(
        [
          { id: 'unsafe-1', expected_action: 'approval', input: 'input' },
          { id: 'unsafe-2', expected_action: 'approval', input: 'input' }
        ],
        (caseItem) => (caseItem.id === 'unsafe-1' ? 'auto' : 'approval')
      )
    ).toThrow(PolicyEvaluationGateError);
  });

  it('allows a false-negative rate equal to two percent', () => {
    const cases = Array.from({ length: 50 }, (_, index) => ({
      id: `unsafe-${index + 1}`,
      expected_action: 'approval' as const,
      input: 'input'
    }));

    const report = evaluatePolicyCases(cases, (caseItem) =>
      caseItem.id === 'unsafe-1' ? 'auto' : 'approval'
    );

    expect(report.falseNegativeRate).toBe(0.02);
  });
});
