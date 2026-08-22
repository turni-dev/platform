-- Dual-period spend cap: per-agent-run accident (a single run burning
-- through tokens in seconds) is tracked separately from per-tenant-month
-- accident (many small overspends accumulating over the calendar month).
-- The month counter reuses the existing generic usage_counters table
-- (metric = 'llm_spend_micros'); the run counter needs its own table since
-- usage_counters has no run dimension.
CREATE TABLE agent_run_spend (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  run_id uuid NOT NULL,
  spent_micros bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, run_id),
  CONSTRAINT agent_run_spend_spent_micros_check CHECK (spent_micros >= 0)
);

ALTER TABLE agent_run_spend ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_run_spend FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_run_spend_tenant_isolation ON agent_run_spend
  FOR ALL TO app_rw
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON agent_run_spend TO app_rw;
