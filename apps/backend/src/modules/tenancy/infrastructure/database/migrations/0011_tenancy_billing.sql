CREATE TABLE subscriptions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  plan text NOT NULL,
  status text NOT NULL,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_plan_check CHECK (plan IN ('trial', 'start', 'pro')),
  CONSTRAINT subscriptions_status_check CHECK (
    status IN ('trialing', 'active', 'past_due', 'paused', 'cancelled')
  )
);
CREATE TABLE invoices (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
  amount numeric(10, 2) NOT NULL,
  currency char(3) NOT NULL DEFAULT 'RUB',
  status text NOT NULL DEFAULT 'draft',
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_amount_check CHECK (amount >= 0),
  CONSTRAINT invoices_status_check
    CHECK (status IN ('draft', 'sent', 'paid', 'void'))
);

CREATE INDEX subscriptions_tenant_idx ON subscriptions (tenant_id);
CREATE INDEX invoices_tenant_status_idx ON invoices (tenant_id, status);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_tenant_isolation ON subscriptions
  FOR ALL TO app_rw
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY invoices_tenant_isolation ON invoices
  FOR ALL TO app_rw
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON subscriptions TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON invoices TO app_rw;
