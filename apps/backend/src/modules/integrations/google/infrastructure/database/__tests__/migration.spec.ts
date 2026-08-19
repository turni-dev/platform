import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const googleConnectionsMigrationUrl = new URL(
  '../migrations/0019_google_connections.sql',
  import.meta.url
);

describe('google connections migration', () => {
  it('creates the google_connections table with RLS and the resources jsonb column', async () => {
    const migration = await readFile(googleConnectionsMigrationUrl, 'utf8');

    expect(migration).toContain('CREATE TABLE google_connections');
    expect(migration).toContain('id uuid PRIMARY KEY');
    expect(migration).toContain(
      'tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT'
    );
    expect(migration).toContain(
      'agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE RESTRICT'
    );
    expect(migration).toContain("status text NOT NULL DEFAULT 'pending'");
    expect(migration).toContain(
      "CHECK (status IN ('pending', 'active', 'error', 'disabled'))"
    );
    expect(migration).toContain('scopes text[] NOT NULL');
    expect(migration).toContain('refresh_token_enc text');
    expect(migration).toContain('google_account_email text');
    expect(migration).toContain("resources jsonb NOT NULL DEFAULT '{}'::jsonb");
    expect(migration).toContain("meta jsonb NOT NULL DEFAULT '{}'::jsonb");
    expect(migration).toContain('deleted_at timestamptz');
    expect(migration).toContain('created_at timestamptz NOT NULL DEFAULT now()');

    // No dedicated calendar_id/spreadsheet_id columns: resource selections
    // live in the resources jsonb column so future Google services don't
    // need a schema migration each time.
    expect(migration).not.toContain('calendar_id');
    expect(migration).not.toContain('spreadsheet_id');

    expect(migration).toContain(
      'CREATE INDEX google_connections_tenant_idx ON google_connections (tenant_id)'
    );
    expect(migration).toContain('WHERE deleted_at IS NULL');
    expect(migration).toContain(
      'ALTER TABLE google_connections ENABLE ROW LEVEL SECURITY'
    );
    expect(migration).toContain(
      'ALTER TABLE google_connections FORCE ROW LEVEL SECURITY'
    );
    expect(migration).toContain(
      'CREATE POLICY google_connections_tenant_isolation ON google_connections'
    );
    expect(migration).toContain('FOR ALL TO app_rw');
    expect(migration).toContain(
      "USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)"
    );
    expect(migration).toContain(
      "WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)"
    );
    expect(migration).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON google_connections TO app_rw'
    );
  });
});
