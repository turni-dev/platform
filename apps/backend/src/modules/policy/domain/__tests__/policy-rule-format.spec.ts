import { describe, expect, it } from 'vitest';
import { compilePolicyRule } from '../policy-rule-format.js';

describe('compilePolicyRule', () => {
  it('parses a strict rule and compiles a reusable matcher', () => {
    const rule = compilePolicyRule({
      id: 'allergen-lock',
      verdict: 'approval',
      riskScore: 10,
      locked: true,
      pattern: { source: 'аллерги\\S*', flags: 'iu' }
    });

    expect(rule.matches('У гостя аллергия на орехи')).toBe(true);
    expect(rule.id).toBe('allergen-lock');
  });

  it('rejects unsupported regex flags and invalid expressions', () => {
    expect(() => compilePolicyRule({ id: 'x', verdict: 'auto', riskScore: 1, locked: false, pattern: { source: 'x', flags: 'g' } })).toThrow();
    expect(() => compilePolicyRule({ id: 'x', verdict: 'auto', riskScore: 1, locked: false, pattern: { source: '[', flags: 'u' } })).toThrow();
  });
});
