import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  agentRunSpend,
  evalCases,
  modelConfigs,
  policies,
  policyTables,
  prompts
} from './schema.js';

describe('policy database schema', () => {
  it('owns tenant policies and global AI configuration', () => {
    expect(policyTables.map((table) => getTableConfig(table).name)).toEqual([
      'policies',
      'prompts',
      'model_configs',
      'eval_cases',
      'agent_run_spend'
    ]);
  });

  it('isolates tenant policies and protects locked rows', () => {
    const config = getTableConfig(policies);

    expect(config.enableRLS).toBe(true);
    expect(config.policies.map((policy) => policy.name)).toEqual([
      'policies_tenant_isolation',
      'policies_locked_update',
      'policies_locked_delete'
    ]);
    expect(config.policies.slice(1).every((policy) => policy.as === 'restrictive'))
      .toBe(true);
  });

  it('keeps global configuration outside tenant RLS', () => {
    for (const table of [prompts, modelConfigs, evalCases]) {
      expect(getTableConfig(table).enableRLS).toBe(false);
    }
  });

  it('allows one active immutable prompt version per key', () => {
    const config = getTableConfig(prompts);
    const versionIndex = config.indexes.find(
      (index) => index.config.name === 'prompts_key_version_uidx'
    );
    const activeIndex = config.indexes.find(
      (index) => index.config.name === 'prompts_key_active_uidx'
    );

    expect(versionIndex?.config.unique).toBe(true);
    expect(activeIndex?.config.unique).toBe(true);
    expect(activeIndex?.config.where).toBeDefined();
  });

  it('uses text checks for model and eval vocabularies', () => {
    expect(getTableConfig(modelConfigs).checks.map((check) => check.name))
      .toEqual([
        'model_configs_role_check',
        'model_configs_tier_check',
        'model_configs_provider_check',
        'model_configs_api_kind_check'
      ]);
    expect(getTableConfig(evalCases).checks.map((check) => check.name))
      .toEqual(['eval_cases_risk_label_check', 'eval_cases_source_check']);
  });

  it('makes model routing provider-aware with safe defaults', () => {
    const config = getTableConfig(modelConfigs);
    const provider = config.columns.find((column) => column.name === 'provider');
    const apiKind = config.columns.find((column) => column.name === 'api_kind');

    expect(provider?.notNull).toBe(true);
    expect(provider?.default).toBe('yandex-ai-studio');
    expect(apiKind?.notNull).toBe(true);
    expect(apiKind?.default).toBe('native');
  });

  it('isolates per-run spend accumulation by tenant and forbids negative totals', () => {
    const config = getTableConfig(agentRunSpend);

    expect(config.enableRLS).toBe(true);
    expect(config.policies.map((policy) => policy.name)).toEqual([
      'agent_run_spend_tenant_isolation'
    ]);
    expect(config.checks.map((check) => check.name)).toEqual([
      'agent_run_spend_spent_micros_check'
    ]);
    expect(config.primaryKeys[0]?.columns.map((column) => column.name)).toEqual([
      'tenant_id',
      'run_id'
    ]);
  });
});
