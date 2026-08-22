import { describe, expect, it } from 'vitest';

import { parseSelectorPolicyYaml } from '../policy-rule-yaml-parser.js';

const YAML_DOCUMENT = `
rules:
  - id: allergen-health-lock
    layer: locked
    target:
      type: keyword
      source: "аллерги\\\\S*"
      flags: iu
    effect: require_approval
    params:
      riskScore: 10
  - id: calendar-write-template
    layer: workspace
    target:
      type: tool
      toolId: calendar.write
    effect: allow
    params:
      riskScore: 4
      allowlist: [calendar.write]
`;

describe('parseSelectorPolicyYaml', () => {
  it('parses a YAML document into compiled (path, layer, compiled) rows', () => {
    const rows = parseSelectorPolicyYaml(YAML_DOCUMENT);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ path: 'allergen-health-lock', layer: 'locked' });
    expect(rows[0]?.compiled.verdict).toBe('approval');
    expect(rows[1]).toMatchObject({ path: 'calendar-write-template', layer: 'workspace' });
    expect(rows[1]?.compiled.allowlist).toEqual(['calendar.write']);
  });

  it('rejects a document with no rules', () => {
    expect(() => parseSelectorPolicyYaml('rules: []')).toThrow();
  });

  it('rejects a document missing the rules key', () => {
    expect(() => parseSelectorPolicyYaml('not_rules: []')).toThrow();
  });

  it('rejects duplicate rule ids', () => {
    const duplicated = `
rules:
  - id: dup
    layer: workspace
    target: { type: tool, toolId: calendar.read }
    effect: allow
    params: { riskScore: 1 }
  - id: dup
    layer: agent
    target: { type: tool, toolId: sheets.read }
    effect: allow
    params: { riskScore: 1 }
`;
    expect(() => parseSelectorPolicyYaml(duplicated)).toThrow(/Duplicate/u);
  });

  it('rejects malformed YAML', () => {
    expect(() => parseSelectorPolicyYaml('rules: [')).toThrow();
  });
});
