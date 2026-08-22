import { describe, expect, it } from 'vitest';

import { computeDefaultPolicySet } from '../default-policy-set.js';
import type { SelectorPolicyRule } from '../policy-rule-selector.js';

const RULE_A: SelectorPolicyRule = {
  id: 'rule-a',
  layer: 'locked',
  target: { type: 'keyword', source: 'аллерги\\S*', flags: 'iu' },
  effect: 'require_approval',
  params: { riskScore: 10 }
};

const RULE_B: SelectorPolicyRule = {
  id: 'rule-b',
  layer: 'workspace',
  target: { type: 'tool', toolId: 'calendar.write' },
  effect: 'allow',
  params: { riskScore: 4 }
};

describe('computeDefaultPolicySet', () => {
  it('is deterministic regardless of input order', () => {
    const forward = computeDefaultPolicySet('v1', [RULE_A, RULE_B]);
    const backward = computeDefaultPolicySet('v1', [RULE_B, RULE_A]);

    expect(forward.fingerprint).toBe(backward.fingerprint);
    expect(forward.fingerprint).toHaveLength(64);
  });

  it('changes fingerprint when a rule field changes, independent of the version label', () => {
    const original = computeDefaultPolicySet('v1', [RULE_A, RULE_B]);
    const edited = computeDefaultPolicySet('v1', [
      { ...RULE_A, params: { riskScore: 9 } },
      RULE_B
    ]);

    expect(edited.fingerprint).not.toBe(original.fingerprint);
  });

  it('keeps the same fingerprint when nothing about the rules changed, even if version is re-labelled', () => {
    const v1 = computeDefaultPolicySet('v1', [RULE_A, RULE_B]);
    const v2 = computeDefaultPolicySet('v2', [RULE_A, RULE_B]);

    expect(v1.fingerprint).toBe(v2.fingerprint);
    expect(v1.version).not.toBe(v2.version);
  });

  it('compiles every rule into a (path, layer, compiled) row', () => {
    const set = computeDefaultPolicySet('v1', [RULE_A, RULE_B]);

    expect(set.rows.map((row) => row.path)).toEqual(['rule-a', 'rule-b']);
  });
});
