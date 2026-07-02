CREATE TABLE events (
  id uuid NOT NULL,
  tenant_id uuid REFERENCES tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  version smallint NOT NULL DEFAULT 1,
  actor jsonb NOT NULL,
  correlation_id uuid NOT NULL,
  props jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at),
  CONSTRAINT events_version_check CHECK (version > 0)
) PARTITION BY RANGE (created_at);
CREATE TABLE events_default PARTITION OF events DEFAULT;

CREATE TABLE usage_counters (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  period date NOT NULL,
  metric text NOT NULL,
  value bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, period, metric),
  CONSTRAINT usage_counters_value_check CHECK (value >= 0)
);

CREATE TABLE payment_events (
  id uuid PRIMARY KEY,
  provider text NOT NULL,
  event_id text NOT NULL UNIQUE,
  payment_id text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX events_tenant_name_created_idx
  ON events (tenant_id, name, created_at);
CREATE INDEX payment_events_payment_id_idx ON payment_events (payment_id);

CREATE FUNCTION reject_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'events are append-only';
END
$$;
CREATE TRIGGER events_no_update
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION reject_event_mutation();
CREATE TRIGGER events_no_delete
  BEFORE DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION reject_event_mutation();

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE events FORCE ROW LEVEL SECURITY;
CREATE POLICY events_tenant_isolation ON events
  FOR ALL TO app_rw
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_counters FORCE ROW LEVEL SECURITY;
CREATE POLICY usage_counters_tenant_isolation ON usage_counters
  FOR ALL TO app_rw
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT ON events TO app_rw;
REVOKE UPDATE, DELETE ON events FROM app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON usage_counters TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON payment_events TO app_rw;
