import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('./migrations/0007_policy.sql', import.meta.url);
const modelRoutingMigrationUrl = new URL(
  './migrations/0014_policy_model_routing.sql',
  import.meta.url
);
const layerHierarchyMigrationUrl = new URL(
  './migrations/0022_policy_layer_hierarchy.sql',
  import.meta.url
);

describe('policy migration', () => {
  it('creates the complete policy table slice', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(
      [...migration.matchAll(/CREATE TABLE ([a-z_]+)/g)].map(
        (match) => match[1]
      )
    ).toEqual(['policies', 'prompts', 'model_configs', 'eval_cases']);
  });

  it('forces tenant isolation and protects locked policy rows', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain('ALTER TABLE policies ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('ALTER TABLE policies FORCE ROW LEVEL SECURITY');
    expect(migration).toContain('CREATE POLICY policies_tenant_isolation');
    expect(migration.match(/AS RESTRICTIVE/g)).toHaveLength(2);
    expect(migration).toContain("layer <> 'locked'");
  });

  it('keeps global AI configuration read-only for app_rw', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    for (const table of ['prompts', 'model_configs', 'eval_cases']) {
      expect(migration).not.toContain(
        `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`
      );
      expect(migration).toContain(`GRANT SELECT ON ${table} TO app_rw`);
      expect(migration).toContain(
        `REVOKE INSERT, UPDATE, DELETE ON ${table} FROM app_rw`
      );
    }
  });

  it('allows CI activation without mutating immutable prompt content', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain('CREATE FUNCTION protect_prompt_version()');
    expect(migration).toContain(
      'OLD.key IS DISTINCT FROM NEW.key OR'
    );
    expect(migration).toContain(
      'OLD.content IS DISTINCT FROM NEW.content OR'
    );
    expect(migration).toContain('CREATE TRIGGER prompts_immutable_version');
    expect(migration).toContain('CREATE TRIGGER prompts_no_delete');
  });

  it('uses application UUIDv7 and text checks', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).not.toMatch(/id uuid [^,\n]*DEFAULT/i);
    expect(migration).not.toMatch(/gen_random_uuid|uuid_generate/i);
    expect(migration).toContain('CONSTRAINT policies_layer_check CHECK');
    expect(migration).toMatch(/CONSTRAINT model_configs_role_check\s+CHECK/);
    expect(migration).toContain("'complex'");
    expect(migration).not.toContain("'summarize'");
    expect(migration).toMatch(
      /CONSTRAINT eval_cases_risk_label_check\s+CHECK/
    );
  });

  it('expands model configuration routing without invalidating existing rows', async () => {
    const migration = await readFile(modelRoutingMigrationUrl, 'utf8');

    expect(migration).toContain('ALTER TABLE model_configs');
    expect(migration).toContain(
      "ADD COLUMN provider text NOT NULL DEFAULT 'yandex-ai-studio'"
    );
    expect(migration).toContain(
      "ADD COLUMN api_kind text NOT NULL DEFAULT 'native'"
    );
    expect(migration).toMatch(
      /CONSTRAINT model_configs_provider_check\s+CHECK/
    );
    expect(migration).toMatch(
      /CONSTRAINT model_configs_api_kind_check\s+CHECK/
    );
    expect(migration).not.toContain('CREATE TABLE model_configs');
  });

  it('expands the layer hierarchy without dropping the legacy custom value', async () => {
    const migration = await readFile(layerHierarchyMigrationUrl, 'utf8');

    expect(migration).toContain('ALTER TABLE policies DROP CONSTRAINT policies_layer_check');
    expect(migration).toMatch(
      /ALTER TABLE policies ADD CONSTRAINT policies_layer_check\s+CHECK/
    );
    expect(migration).toContain(
      "CHECK (layer IN ('locked', 'workspace', 'agent', 'user', 'custom'))"
    );
    expect(migration).not.toContain('CREATE TABLE');
    expect(migration).not.toContain('DROP TABLE');
  });
});
