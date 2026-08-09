CREATE TABLE guest_sessions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  connection_id uuid NOT NULL
    REFERENCES channel_connections(id) ON DELETE RESTRICT,
  guest_id uuid REFERENCES guests(id) ON DELETE RESTRICT,
  token_hash bytea NOT NULL,
  token_kid text NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX guest_sessions_token_hash_uidx ON guest_sessions (token_hash);
CREATE INDEX guest_sessions_tenant_expires_idx
  ON guest_sessions (tenant_id, expires_at);
ALTER TABLE guest_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY guest_sessions_tenant_isolation ON guest_sessions
  FOR ALL TO app_rw
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON guest_sessions TO app_rw;
