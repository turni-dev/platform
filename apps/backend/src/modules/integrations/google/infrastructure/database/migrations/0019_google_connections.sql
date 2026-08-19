CREATE TABLE google_connections (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'error', 'disabled')),
  scopes text[] NOT NULL,
  refresh_token_enc text,
  google_account_email text,
  resources jsonb NOT NULL DEFAULT '{}'::jsonb,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX google_connections_tenant_idx ON google_connections (tenant_id)
  WHERE deleted_at IS NULL;
ALTER TABLE google_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY google_connections_tenant_isolation ON google_connections
  FOR ALL TO app_rw
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON google_connections TO app_rw;
