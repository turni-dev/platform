-- Tracks which "dimension" (version + content fingerprint) of the shipped
-- default policy set (infrastructure/database/default-policies.yaml) a
-- tenant/agent was last provisioned at -- see
-- application/policy-provisioning-service.ts. One row per (tenant, agent):
-- re-provisioning compares the stored fingerprint against the current one
-- and is a pure no-op when they match, so applying defaults twice never
-- duplicates `policies` rows.
CREATE TABLE policy_provisioning (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  agent_id uuid NOT NULL,
  defaults_version text NOT NULL,
  defaults_fingerprint text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, agent_id)
);

ALTER TABLE policy_provisioning ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_provisioning FORCE ROW LEVEL SECURITY;
CREATE POLICY policy_provisioning_tenant_isolation ON policy_provisioning
  FOR ALL TO app_rw
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON policy_provisioning TO app_rw;
