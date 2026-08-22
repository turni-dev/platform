CREATE TABLE outbound_triggers (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  consecutive_failures integer NOT NULL DEFAULT 0
    CHECK (consecutive_failures >= 0),
  failure_threshold integer NOT NULL DEFAULT 3
    CHECK (failure_threshold > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX outbound_triggers_tenant_idx ON outbound_triggers (tenant_id);
CREATE INDEX outbound_triggers_tenant_active_idx ON outbound_triggers (tenant_id)
  WHERE status = 'active';

ALTER TABLE outbound_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_triggers FORCE ROW LEVEL SECURITY;

CREATE POLICY outbound_triggers_tenant_isolation ON outbound_triggers
  FOR ALL TO app_rw
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON outbound_triggers TO app_rw;
