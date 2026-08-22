import { describe, expect, it } from 'vitest';

import { computeDefaultPolicySet } from '../../domain/default-policy-set.js';
import type { SelectorPolicyRule } from '../../domain/policy-rule-selector.js';
import { FakePolicyProvisioningTracker } from '../fake-policy-provisioning-tracker.js';
import { FakePolicyWriter } from '../fake-policy-writer.js';
import { PolicyProvisioningService } from '../policy-provisioning-service.js';

const IDENTITY = {
  tenantId: '11111111-1111-1111-1111-111111111111',
  agentId: '22222222-2222-2222-2222-222222222222'
};

const RULE_A: SelectorPolicyRule = {
  id: 'allergen-health-lock',
  layer: 'locked',
  target: { type: 'keyword', source: 'аллерги\\S*', flags: 'iu' },
  effect: 'require_approval',
  params: { riskScore: 10 }
};

const RULE_B: SelectorPolicyRule = {
  id: 'human-handoff-template',
  layer: 'workspace',
  target: { type: 'keyword', source: 'оператор\\S*', flags: 'iu' },
  effect: 'escalate_human',
  params: { riskScore: 5 }
};

function service(rules: readonly SelectorPolicyRule[], version = 'v1') {
  const writer = new FakePolicyWriter();
  const tracker = new FakePolicyProvisioningTracker();
  const defaults = computeDefaultPolicySet(version, rules);
  return { writer, tracker, defaults, service: new PolicyProvisioningService(writer, tracker, defaults) };
}

describe('PolicyProvisioningService', () => {
  it('inserts every default rule on first provisioning', async () => {
    const { service: svc, writer } = service([RULE_A, RULE_B]);

    const result = await svc.provision(IDENTITY);

    expect(result.applied).toBe(true);
    expect(result.insertedRuleIds).toEqual(['allergen-health-lock', 'human-handoff-template']);
    expect(result.skippedRuleIds).toEqual([]);
    expect(writer.allRows(IDENTITY)).toHaveLength(2);
  });

  it('is a pure no-op on re-provisioning with the same default set (idempotent by fingerprint, not existence)', async () => {
    const { service: svc, writer } = service([RULE_A, RULE_B]);

    await svc.provision(IDENTITY);
    const second = await svc.provision(IDENTITY);

    expect(second.applied).toBe(false);
    expect(writer.allRows(IDENTITY)).toHaveLength(2);
  });

  it('never duplicates a row across repeated provisioning calls', async () => {
    const { service: svc, writer } = service([RULE_A]);

    await svc.provision(IDENTITY);
    await svc.provision(IDENTITY);
    await svc.provision(IDENTITY);

    expect(writer.allRows(IDENTITY)).toHaveLength(1);
  });

  it('applies only newly introduced rules when the shipped defaults change, leaving existing rows untouched', async () => {
    const first = service([RULE_A], 'v1');
    await first.service.provision(IDENTITY);

    const secondDefaults = computeDefaultPolicySet('v2', [
      { ...RULE_A, params: { riskScore: 9 } }, // an edited existing rule -- must NOT be overwritten
      RULE_B // a newly introduced rule -- must be inserted
    ]);
    const second = new PolicyProvisioningService(first.writer, first.tracker, secondDefaults);

    const result = await second.provision(IDENTITY);

    expect(result.applied).toBe(true);
    expect(result.insertedRuleIds).toEqual(['human-handoff-template']);
    expect(result.skippedRuleIds).toEqual(['allergen-health-lock']);

    const existing = first.writer.allRows(IDENTITY).find((row) => row.path === 'allergen-health-lock');
    expect(existing?.compiled.riskScore).toBe(10); // unchanged from the first provisioning
  });

  it('re-detects and re-applies after the defaults dimension changes back and forth without erroring', async () => {
    const v1 = computeDefaultPolicySet('v1', [RULE_A]);
    const v2 = computeDefaultPolicySet('v2', [RULE_A, RULE_B]);
    const writer = new FakePolicyWriter();
    const tracker = new FakePolicyProvisioningTracker();

    await new PolicyProvisioningService(writer, tracker, v1).provision(IDENTITY);
    await new PolicyProvisioningService(writer, tracker, v2).provision(IDENTITY);
    const third = await new PolicyProvisioningService(writer, tracker, v2).provision(IDENTITY);

    expect(third.applied).toBe(false);
    expect(writer.allRows(IDENTITY)).toHaveLength(2);
  });

  it('keeps provisioning isolated per tenant/agent identity', async () => {
    const { service: svc, writer } = service([RULE_A]);
    const other = { tenantId: '33333333-3333-3333-3333-333333333333', agentId: '44444444-4444-4444-4444-444444444444' };

    await svc.provision(IDENTITY);
    await svc.provision(other);

    expect(writer.allRows(IDENTITY)).toHaveLength(1);
    expect(writer.allRows(other)).toHaveLength(1);
  });
});
