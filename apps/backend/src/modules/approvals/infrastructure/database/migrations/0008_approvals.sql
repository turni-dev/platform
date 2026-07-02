CREATE TABLE approvals (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  action_id uuid REFERENCES actions(id) ON DELETE RESTRICT,
  message_id uuid REFERENCES messages(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  policy_rule_id text,
  confidence numeric(3, 2),
  card jsonb NOT NULL,
  rag_sources jsonb,
  sla_deadline timestamptz,
  decision text,
  edited_payload jsonb,
  edit_diff text,
  created_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  decided_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approvals_single_subject_check
    CHECK (num_nonnulls(action_id, message_id) = 1),
  CONSTRAINT approvals_reason_check CHECK (reason IN (
    'refund', 'complaint', 'banquet', 'allergen_miss',
    'out_of_kb', 'low_confidence', 'policy_rule'
  )),
  CONSTRAINT approvals_confidence_check
    CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  CONSTRAINT approvals_decision_check CHECK (
    decision IS NULL OR decision IN ('approved', 'edited', 'rejected', 'expired')
  )
);

CREATE INDEX approvals_pending_idx
  ON approvals (tenant_id, sla_deadline)
  WHERE decision IS NULL;

ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals FORCE ROW LEVEL SECURITY;
CREATE POLICY approvals_tenant_isolation ON approvals
  FOR ALL TO app_rw
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON approvals TO app_rw;
