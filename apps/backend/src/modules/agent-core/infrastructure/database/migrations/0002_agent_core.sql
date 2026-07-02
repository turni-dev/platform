CREATE TABLE agents (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  template text NOT NULL DEFAULT 'dining',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'training', 'active', 'paused')),
  autonomy jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE actions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  conversation_id uuid NOT NULL,
  tool text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN (
      'proposed', 'pending_approval', 'executing', 'done',
      'undone', 'cancelled', 'failed'
    )),
  undo_deadline timestamptz,
  error text,
  created_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE bookings (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  guest_id uuid NOT NULL,
  conversation_id uuid,
  at timestamptz NOT NULL,
  party_size smallint NOT NULL CHECK (party_size > 0),
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN (
      'requested', 'confirmed', 'seated', 'no_show', 'cancelled'
    )),
  note text,
  created_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE idempotency_keys (
  key text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  request_hash text NOT NULL,
  response jsonb,
  status_code integer,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX agents_tenant_name_active_uidx
  ON agents (tenant_id, name) WHERE deleted_at IS NULL;
CREATE INDEX agents_tenant_idx ON agents (tenant_id);
CREATE INDEX actions_pending_idx ON actions (tenant_id)
  WHERE status IN ('proposed', 'pending_approval', 'executing');
CREATE INDEX actions_conversation_idx ON actions (conversation_id);
CREATE UNIQUE INDEX bookings_active_slot_uidx
  ON bookings (tenant_id, location_id, guest_id, at)
  WHERE status NOT IN ('cancelled', 'no_show');
CREATE INDEX bookings_location_at_idx
  ON bookings (tenant_id, location_id, at);
CREATE INDEX idempotency_keys_tenant_expires_idx
  ON idempotency_keys (tenant_id, expires_at);
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents FORCE ROW LEVEL SECURITY;
ALTER TABLE actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions FORCE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings FORCE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY agents_tenant_isolation ON agents
  FOR ALL TO app_rw
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY actions_tenant_isolation ON actions
  FOR ALL TO app_rw
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY bookings_tenant_isolation ON bookings
  FOR ALL TO app_rw
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY idempotency_keys_tenant_isolation ON idempotency_keys
  FOR ALL TO app_rw
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON agents TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON actions TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON bookings TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON idempotency_keys TO app_rw;
