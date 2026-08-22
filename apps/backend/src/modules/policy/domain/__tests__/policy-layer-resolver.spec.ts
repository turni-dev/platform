import { describe, expect, it } from 'vitest';

import {
  PolicyResolverValidationError,
  resolvePolicyLayer,
  resolvePolicyLayers
} from '../policy-layer-resolver.js';
import type { PolicyLayerRule } from '../policy-layer.js';

function rule(overrides: Partial<PolicyLayerRule> & { layer: PolicyLayerRule['layer'] }): PolicyLayerRule {
  return {
    verdict: 'auto',
    riskScore: 1,
    allowlist: undefined,
    approvalRequired: false,
    budgetLimit: undefined,
    ...overrides
  };
}

const lockedApproval = rule({
  layer: 'locked',
  verdict: 'approval',
  riskScore: 10,
  approvalRequired: true
});

describe('resolvePolicyLayer', () => {
  it('accepts a lower layer that tightens every field', () => {
    const upper = rule({
      layer: 'workspace',
      verdict: 'escalate_human',
      riskScore: 5,
      allowlist: ['calendar.read', 'calendar.write', 'sheets.read'],
      approvalRequired: false,
      budgetLimit: 10_000
    });
    const proposed = rule({
      layer: 'agent',
      verdict: 'approval',
      riskScore: 8,
      allowlist: ['calendar.read'],
      approvalRequired: true,
      budgetLimit: 2_000
    });

    expect(resolvePolicyLayer(upper, proposed)).toEqual(proposed);
  });

  it('accepts a lower layer that changes nothing (equality passes)', () => {
    const upper = rule({ layer: 'workspace', verdict: 'auto', riskScore: 3, allowlist: ['calendar.read'] });
    const proposed = rule({ layer: 'agent', verdict: 'auto', riskScore: 3, allowlist: ['calendar.read'] });

    expect(resolvePolicyLayer(upper, proposed)).toEqual(proposed);
  });

  it('rejects a lower riskScore', () => {
    const upper = rule({ layer: 'workspace', riskScore: 6 });
    const proposed = rule({ layer: 'agent', riskScore: 3 });

    expect(() => resolvePolicyLayer(upper, proposed)).toThrow(PolicyResolverValidationError);
    try {
      resolvePolicyLayer(upper, proposed);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PolicyResolverValidationError);
      const validationError = error as PolicyResolverValidationError;
      expect(validationError.field).toBe('riskScore');
      expect(validationError.upperLayer).toBe('workspace');
      expect(validationError.proposedLayer).toBe('agent');
      expect(validationError.message).toContain('riskScore');
    }
  });

  it('rejects a less strict verdict', () => {
    const upper = rule({ layer: 'workspace', verdict: 'refuse' });
    const proposed = rule({ layer: 'agent', verdict: 'auto' });

    expect(() => resolvePolicyLayer(upper, proposed)).toThrow(PolicyResolverValidationError);
    expect(() => resolvePolicyLayer(upper, proposed)).toThrow(/verdict/u);
  });

  it('rejects an allowlist that adds items not permitted upstream', () => {
    const upper = rule({ layer: 'workspace', allowlist: ['calendar.read'] });
    const proposed = rule({ layer: 'agent', allowlist: ['calendar.read', 'sheets.write'] });

    expect(() => resolvePolicyLayer(upper, proposed)).toThrow(PolicyResolverValidationError);
    expect(() => resolvePolicyLayer(upper, proposed)).toThrow(/allowlist/u);
  });

  it('rejects an allowlist removed entirely (unrestricted is wider than any restriction)', () => {
    const upper = rule({ layer: 'workspace', allowlist: ['calendar.read'] });
    const proposed = rule({ layer: 'agent', allowlist: undefined });

    expect(() => resolvePolicyLayer(upper, proposed)).toThrow(PolicyResolverValidationError);
    expect(() => resolvePolicyLayer(upper, proposed)).toThrow(/allowlist/u);
  });

  it('rejects approval being dropped', () => {
    const upper = rule({ layer: 'workspace', approvalRequired: true });
    const proposed = rule({ layer: 'agent', approvalRequired: false });

    expect(() => resolvePolicyLayer(upper, proposed)).toThrow(PolicyResolverValidationError);
    expect(() => resolvePolicyLayer(upper, proposed)).toThrow(/approval/u);
  });

  it('rejects a raised budget, including turning a capped budget unlimited', () => {
    const upper = rule({ layer: 'workspace', budgetLimit: 5_000 });

    expect(() => resolvePolicyLayer(upper, rule({ layer: 'agent', budgetLimit: 9_000 })))
      .toThrow(PolicyResolverValidationError);
    expect(() => resolvePolicyLayer(upper, rule({ layer: 'agent', budgetLimit: undefined })))
      .toThrow(/budget/u);
  });

  it('allows a lower budget when the upper layer is unlimited', () => {
    const upper = rule({ layer: 'workspace', budgetLimit: undefined });
    const proposed = rule({ layer: 'agent', budgetLimit: 100 });

    expect(resolvePolicyLayer(upper, proposed)).toEqual(proposed);
  });

  it('rejects a layer that is not strictly below the upper layer', () => {
    const upper = rule({ layer: 'agent' });
    const proposed = rule({ layer: 'workspace' });

    expect(() => resolvePolicyLayer(upper, proposed)).toThrow(PolicyResolverValidationError);
  });

  it('always keeps the locked outcome, even against a stricter proposal', () => {
    const stricterProposal = rule({
      layer: 'workspace',
      verdict: 'approval',
      riskScore: 10,
      approvalRequired: true
    });

    expect(resolvePolicyLayer(lockedApproval, stricterProposal)).toEqual(lockedApproval);
  });

  it('always keeps the locked outcome against an (invalid, weaker) proposal too', () => {
    const weakerProposal = rule({ layer: 'workspace', verdict: 'auto', riskScore: 1 });

    expect(resolvePolicyLayer(lockedApproval, weakerProposal)).toEqual(lockedApproval);
  });
});

describe('resolvePolicyLayers', () => {
  it('folds workspace -> agent -> user, each tightening the last', () => {
    const workspace = rule({ layer: 'workspace', verdict: 'escalate_human', riskScore: 4, budgetLimit: 10_000 });
    const agent = rule({ layer: 'agent', verdict: 'escalate_human', riskScore: 6, budgetLimit: 5_000 });
    const user = rule({ layer: 'user', verdict: 'approval', riskScore: 8, budgetLimit: 1_000, approvalRequired: true });

    expect(resolvePolicyLayers([workspace, agent, user])).toEqual(user);
  });

  it('stops at the first weakening layer in the fold', () => {
    const workspace = rule({ layer: 'workspace', riskScore: 6 });
    const agent = rule({ layer: 'agent', riskScore: 6 });
    const user = rule({ layer: 'user', riskScore: 3 });

    expect(() => resolvePolicyLayers([workspace, agent, user]))
      .toThrow(PolicyResolverValidationError);
  });

  it('a single-layer fold returns that layer unchanged', () => {
    const workspace = rule({ layer: 'workspace', verdict: 'refuse', riskScore: 6 });

    expect(resolvePolicyLayers([workspace])).toEqual(workspace);
  });

  it('locked still always wins when composed on top of a resolved workspace/agent fold', () => {
    const workspace = rule({ layer: 'workspace', verdict: 'approval', riskScore: 10, approvalRequired: true });
    const agent = rule({ layer: 'agent', verdict: 'approval', riskScore: 10, approvalRequired: true });

    const composed = resolvePolicyLayers([workspace, agent]);

    expect(resolvePolicyLayer(lockedApproval, composed)).toEqual(lockedApproval);
  });
});
