-- Personal automation requests: one row per detected booking intent, gated
-- on explicit owner approval before any Calendar/Sheets write. Status
-- transitions are enforced application-side as guarded UPDATE ... WHERE
-- status = '<expected>' statements (see
-- postgres-capability-automation-request-repository.ts) so a retried
-- approval click or a redelivered job can never double-execute.
CREATE TABLE capability_automation_requests (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  agent_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  channel text NOT NULL
    CHECK (channel IN ('vk')),
  guest_ref text NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN (
      'pending_approval', 'approved', 'rejected', 'executing', 'executed', 'failed'
    )),
  calendar_summary text NOT NULL,
  calendar_starts_at timestamptz NOT NULL,
  calendar_ends_at timestamptz NOT NULL,
  calendar_event_id text,
  sheets_appended boolean NOT NULL DEFAULT false,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT capability_automation_requests_idempotency_key_uidx
    UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX capability_automation_requests_tenant_idx ON capability_automation_requests (tenant_id);
CREATE INDEX capability_automation_requests_pending_idx ON capability_automation_requests (tenant_id)
  WHERE status = 'pending_approval';

ALTER TABLE capability_automation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE capability_automation_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY capability_automation_requests_tenant_isolation ON capability_automation_requests
  FOR ALL TO app_rw
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON capability_automation_requests TO app_rw;
