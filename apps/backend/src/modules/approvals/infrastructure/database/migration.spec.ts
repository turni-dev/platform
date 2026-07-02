import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL(
  './migrations/0008_approvals.sql',
  import.meta.url
);

describe('approvals migration', () => {
  it('creates the approval inbox with one subject', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration.match(/CREATE TABLE approvals/g)).toHaveLength(1);
    expect(migration).toContain(
      'CHECK (num_nonnulls(action_id, message_id) = 1)'
    );
  });

  it('references audit and subject rows restrictively', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain(
      'action_id uuid REFERENCES actions(id) ON DELETE RESTRICT'
    );
    expect(migration).toContain(
      'message_id uuid REFERENCES messages(id) ON DELETE RESTRICT'
    );
    expect(migration).toContain(
      'created_by uuid REFERENCES users(id) ON DELETE RESTRICT'
    );
    expect(migration).toContain(
      'decided_by uuid REFERENCES users(id) ON DELETE RESTRICT'
    );
  });

  it('forces tenant RLS and indexes pending decisions', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain(
      'ALTER TABLE approvals FORCE ROW LEVEL SECURITY'
    );
    expect(migration).toContain(
      'CREATE POLICY approvals_tenant_isolation ON approvals'
    );
    expect(migration).toContain('CREATE INDEX approvals_pending_idx');
    expect(migration).toContain('WHERE decision IS NULL');
  });

  it('uses checked text vocabularies and application UUIDv7', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain('CONSTRAINT approvals_reason_check');
    expect(migration).toContain('CONSTRAINT approvals_decision_check');
    expect(migration).not.toMatch(/id uuid [^,\n]*DEFAULT/i);
    expect(migration).not.toMatch(/gen_random_uuid|uuid_generate/i);
  });
});
