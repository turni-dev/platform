import { describe, expect, it } from 'vitest';

import { PolicyResolverValidationError } from '../policy-layer-resolver.js';
import { parseSelectorPolicyYaml } from '../policy-rule-yaml-parser.js';
import { validatePolicyWrite } from '../policy-rule-write.js';

describe('validatePolicyWrite', () => {
  it('passes a brand-new path trivially (nothing above it to narrow)', () => {
    const [row] = parseSelectorPolicyYaml(`
rules:
  - id: fresh-path
    layer: workspace
    target: { type: tool, toolId: calendar.read }
    effect: allow
    params: { riskScore: 2 }
`);

    expect(validatePolicyWrite(undefined, row!)).toEqual({
      layer: 'workspace',
      verdict: 'auto',
      riskScore: 2,
      allowlist: undefined,
      approvalRequired: false,
      budgetLimit: undefined
    });
  });

  it('accepts YAML-parsed output that only tightens the existing layer', () => {
    const [workspaceRow, agentRow] = parseSelectorPolicyYaml(`
rules:
  - id: same-path
    layer: workspace
    target: { type: tool, toolId: calendar.write }
    effect: allow
    params: { riskScore: 4, budgetLimit: 10000 }
  - id: same-path-agent
    layer: agent
    target: { type: tool, toolId: calendar.write }
    effect: require_approval
    params: { riskScore: 7, budgetLimit: 2000 }
`);

    const resolved = validatePolicyWrite(
      { layer: workspaceRow!.layer, compiled: workspaceRow!.compiled },
      { layer: agentRow!.layer, compiled: agentRow!.compiled }
    );

    expect(resolved).toEqual({
      layer: 'agent',
      verdict: 'approval',
      riskScore: 7,
      allowlist: undefined,
      approvalRequired: true,
      budgetLimit: 2_000
    });
  });

  it('rejects YAML-parsed output that would weaken the existing layer -- a validation error, not a silent ignore', () => {
    const [workspaceRow, weakerAgentRow] = parseSelectorPolicyYaml(`
rules:
  - id: strict-path
    layer: workspace
    target: { type: tool, toolId: calendar.write }
    effect: require_approval
    params: { riskScore: 8 }
  - id: strict-path-agent
    layer: agent
    target: { type: tool, toolId: calendar.write }
    effect: allow
    params: { riskScore: 3 }
`);

    expect(() =>
      validatePolicyWrite(
        { layer: workspaceRow!.layer, compiled: workspaceRow!.compiled },
        { layer: weakerAgentRow!.layer, compiled: weakerAgentRow!.compiled }
      )
    ).toThrow(PolicyResolverValidationError);
  });

  it('keeps a locked existing row unchanged no matter what is proposed', () => {
    const [lockedRow, proposedRow] = parseSelectorPolicyYaml(`
rules:
  - id: locked-path
    layer: locked
    target: { type: keyword, source: "аллерги\\\\S*", flags: iu }
    effect: require_approval
    params: { riskScore: 10 }
  - id: locked-path-proposal
    layer: workspace
    target: { type: keyword, source: "аллерги\\\\S*", flags: iu }
    effect: require_approval
    params: { riskScore: 10 }
`);

    const resolved = validatePolicyWrite(
      { layer: lockedRow!.layer, compiled: lockedRow!.compiled },
      { layer: proposedRow!.layer, compiled: proposedRow!.compiled }
    );

    expect(resolved.layer).toBe('locked');
    expect(resolved.riskScore).toBe(10);
  });
});
