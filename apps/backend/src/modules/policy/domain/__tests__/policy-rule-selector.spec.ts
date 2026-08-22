import { describe, expect, it } from 'vitest';

import {
  compileSelectorRule,
  matchesPolicyTarget,
  toPolicyLayerRule
} from '../policy-rule-selector.js';

describe('compileSelectorRule', () => {
  it('compiles a keyword-target locked rule into a resolver-compatible row', () => {
    const row = compileSelectorRule({
      id: 'allergen-health-lock',
      layer: 'locked',
      target: { type: 'keyword', source: 'аллерги\\S*', flags: 'iu' },
      effect: 'require_approval',
      params: { riskScore: 10 }
    });

    expect(row.path).toBe('allergen-health-lock');
    expect(row.layer).toBe('locked');
    expect(row.compiled).toMatchObject({
      ruleId: 'allergen-health-lock',
      verdict: 'approval',
      riskScore: 10,
      approvalRequired: true
    });
    expect(row.compiled.allowlist).toBeUndefined();
    expect(row.compiled.budgetLimit).toBeUndefined();
  });

  it('compiles a tool-target rule and derives approvalRequired from an explicit param even when effect is allow', () => {
    const row = compileSelectorRule({
      id: 'calendar-write-approval-template',
      layer: 'workspace',
      target: { type: 'tool', toolId: 'calendar.write' },
      effect: 'allow',
      params: { riskScore: 6, approvalRequired: true, allowlist: ['calendar.write'] }
    });

    expect(row.compiled.verdict).toBe('auto');
    expect(row.compiled.approvalRequired).toBe(true);
    expect(row.compiled.allowlist).toEqual(['calendar.write']);
  });

  it('maps every effect to its verdict', () => {
    const effects: ReadonlyArray<[string, string]> = [
      ['allow', 'auto'],
      ['require_approval', 'approval'],
      ['escalate_human', 'escalate_human'],
      ['refuse', 'refuse'],
      ['out_of_kb', 'out_of_kb']
    ];

    for (const [effect, verdict] of effects) {
      const row = compileSelectorRule({
        id: `effect-${effect.replaceAll('_', '-')}`,
        layer: 'agent',
        target: { type: 'tool', toolId: 'sheets.read' },
        effect,
        params: { riskScore: 1 }
      });
      expect(row.compiled.verdict).toBe(verdict);
    }
  });

  it('rejects an invalid keyword pattern', () => {
    expect(() =>
      compileSelectorRule({
        id: 'bad-pattern',
        layer: 'workspace',
        target: { type: 'keyword', source: '[', flags: 'u' },
        effect: 'refuse',
        params: { riskScore: 5 }
      })
    ).toThrow();
  });

  it('rejects an unknown field (strict schema, no silent typos)', () => {
    expect(() =>
      compileSelectorRule({
        id: 'strict-check',
        layer: 'workspace',
        target: { type: 'tool', toolId: 'calendar.read' },
        effect: 'allow',
        params: { riskScore: 1 },
        extra: 'nope'
      })
    ).toThrow();
  });
});

describe('toPolicyLayerRule', () => {
  it('projects a compiled selector row into the PolicyLayerRule shape the resolver consumes', () => {
    const row = compileSelectorRule({
      id: 'budget-capped',
      layer: 'agent',
      target: { type: 'tool', toolId: 'calendar.write' },
      effect: 'allow',
      params: { riskScore: 3, budgetLimit: 5_000 }
    });

    expect(toPolicyLayerRule(row.layer, row.compiled)).toEqual({
      layer: 'agent',
      verdict: 'auto',
      riskScore: 3,
      allowlist: undefined,
      approvalRequired: false,
      budgetLimit: 5_000
    });
  });
});

describe('matchesPolicyTarget', () => {
  it('matches a keyword target against normalized text', () => {
    const target = { type: 'keyword', source: 'аллерги\\S*', flags: 'iu' } as const;
    expect(matchesPolicyTarget(target, 'у гостя аллергия на орехи')).toBe(true);
    expect(matchesPolicyTarget(target, 'меню на сегодня')).toBe(false);
  });

  it('matches a tool target by exact id', () => {
    const target = { type: 'tool', toolId: 'calendar.write' } as const;
    expect(matchesPolicyTarget(target, 'calendar.write')).toBe(true);
    expect(matchesPolicyTarget(target, 'calendar.read')).toBe(false);
  });
});
