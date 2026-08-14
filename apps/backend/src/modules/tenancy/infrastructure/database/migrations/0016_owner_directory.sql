-- Expand-only: the single pre-tenant mapping that lets owner login resolve a
-- tenant before any tenant context exists. It holds no profile data, and every
-- row it points at stays behind FORCE RLS.
CREATE TABLE owner_directory (
  email citext PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX owner_directory_tenant_idx ON owner_directory (tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON owner_directory TO app_rw;
