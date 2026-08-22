import { describe, expect, it } from 'vitest';

import { loadDefaultPolicies } from '../default-policies-loader.js';

describe('loadDefaultPolicies', () => {
  it('loads the shipped default-policies.yaml with the required locked topics and a workspace template', () => {
    const defaults = loadDefaultPolicies();

    expect(defaults.version).toBe('2026-08-22.1');
    expect(defaults.fingerprint).toHaveLength(64);

    const byPath = new Map(defaults.rows.map((row) => [row.path, row]));
    expect(byPath.get('allergen-health-lock')).toMatchObject({ layer: 'locked' });
    expect(byPath.get('money-financial-lock')).toMatchObject({ layer: 'locked' });
    expect(byPath.get('anti-jailbreak-lock')).toMatchObject({ layer: 'locked' });

    const workspaceRows = defaults.rows.filter((row) => row.layer === 'workspace');
    expect(workspaceRows.length).toBeGreaterThan(0);
  });

  it('produces a stable fingerprint across repeated loads of the same file', () => {
    expect(loadDefaultPolicies().fingerprint).toBe(loadDefaultPolicies().fingerprint);
  });

  it('accepts an in-memory YAML override and rejects a document missing default_policies', () => {
    const overridden = loadDefaultPolicies(`
default_policies:
  version: "test-1"
  rules:
    - id: only-rule
      layer: workspace
      target: { type: tool, toolId: calendar.read }
      effect: allow
      params: { riskScore: 1 }
`);
    expect(overridden.rows).toHaveLength(1);
    expect(overridden.version).toBe('test-1');

    expect(() => loadDefaultPolicies('rules: []')).toThrow();
  });
});
