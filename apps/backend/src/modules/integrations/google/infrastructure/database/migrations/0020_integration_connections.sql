CREATE TABLE integration_connections (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  provider_slug text NOT NULL CHECK (provider_slug IN ('google')),
  provider_version text NOT NULL DEFAULT '1',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'error', 'disabled')),
  granted_scopes text[] NOT NULL,
  credentials_enc text,
  provider_account_email text,
  resources jsonb NOT NULL DEFAULT '{}'::jsonb,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO integration_connections (
  id, tenant_id, agent_id, provider_slug, provider_version, status,
  granted_scopes, credentials_enc, provider_account_email, resources, meta,
  deleted_at, created_at
)
SELECT
  id, tenant_id, agent_id, 'google', '1', status,
  scopes, refresh_token_enc, google_account_email, resources, meta,
  deleted_at, created_at
FROM google_connections;

CREATE INDEX integration_connections_tenant_provider_idx
  ON integration_connections (tenant_id, provider_slug)
  WHERE deleted_at IS NULL;
ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY integration_connections_tenant_isolation ON integration_connections
  FOR ALL TO app_rw
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON integration_connections TO app_rw;
