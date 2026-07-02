CREATE EXTENSION IF NOT EXISTS citext;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    CREATE ROLE app_rw NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;
CREATE TABLE tenants (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  plan text NOT NULL DEFAULT 'trial'
    CHECK (plan IN ('trial', 'start', 'pro')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'deleted')),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE locations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  tz text NOT NULL DEFAULT 'Europe/Moscow',
  address text,
  capacity smallint CHECK (capacity IS NULL OR capacity > 0),
  auto_confirm_seating boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE users (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('owner', 'staff')),
  email citext NOT NULL,
  tg_chat_id bigint,
  notify_prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  token_hash bytea NOT NULL UNIQUE,
  ip inet,
  ua text,
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE auth_codes (
  id uuid PRIMARY KEY,
  email citext NOT NULL,
  code_hash text NOT NULL,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_tenant_email_active_uidx
  ON users (tenant_id, email)
  WHERE deleted_at IS NULL;
CREATE INDEX locations_tenant_idx ON locations (tenant_id);
CREATE INDEX users_tenant_idx ON users (tenant_id);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_tenant_idx ON sessions (tenant_id);
CREATE INDEX auth_codes_email_expires_idx ON auth_codes (email, expires_at);
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations FORCE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY locations_tenant_isolation ON locations
  FOR ALL TO app_rw
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY users_tenant_isolation ON users
  FOR ALL TO app_rw
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY sessions_tenant_isolation ON sessions
  FOR ALL TO app_rw
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON tenants TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON locations TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_codes TO app_rw;
