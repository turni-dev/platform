CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE memory_files (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  path text NOT NULL,
  current_rev integer NOT NULL DEFAULT 1 CHECK (current_rev > 0),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pending_approval', 'archived')),
  pin_to_context boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE memory_revisions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  file_id uuid NOT NULL REFERENCES memory_files(id) ON DELETE CASCADE,
  rev integer NOT NULL CHECK (rev > 0),
  content text NOT NULL,
  author text NOT NULL CHECK (author IN ('owner', 'agent', 'system')),
  source_approval_id uuid,
  created_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX memory_revisions_file_rev_uidx
  ON memory_revisions (file_id, rev);
CREATE TABLE memory_chunks (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  file_id uuid NOT NULL,
  rev integer NOT NULL CHECK (rev > 0),
  idx integer NOT NULL CHECK (idx >= 0),
  heading_path text,
  text text NOT NULL,
  tokens integer,
  embedding vector(1024),
  embedding_model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memory_chunks_file_rev_revisions_fk
    FOREIGN KEY (file_id, rev) REFERENCES memory_revisions(file_id, rev)
    ON DELETE CASCADE
);
CREATE UNIQUE INDEX memory_files_agent_path_active_uidx
  ON memory_files (agent_id, path) WHERE deleted_at IS NULL;
CREATE INDEX memory_files_tenant_agent_idx
  ON memory_files (tenant_id, agent_id);
CREATE INDEX memory_revisions_tenant_file_idx
  ON memory_revisions (tenant_id, file_id);
CREATE UNIQUE INDEX memory_chunks_file_rev_idx_uidx
  ON memory_chunks (file_id, rev, idx);
CREATE INDEX memory_chunks_tenant_file_idx
  ON memory_chunks (tenant_id, file_id);
CREATE FUNCTION reject_memory_revision_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'memory revisions are immutable';
END
$$;
CREATE TRIGGER memory_revisions_immutable_update
  BEFORE UPDATE ON memory_revisions
  FOR EACH ROW EXECUTE FUNCTION reject_memory_revision_update();
ALTER TABLE memory_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_files FORCE ROW LEVEL SECURITY;
ALTER TABLE memory_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE memory_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_chunks FORCE ROW LEVEL SECURITY;
CREATE POLICY memory_files_tenant_isolation ON memory_files
  FOR ALL TO app_rw
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY memory_revisions_tenant_isolation ON memory_revisions
  FOR ALL TO app_rw
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY memory_chunks_tenant_isolation ON memory_chunks
  FOR ALL TO app_rw
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON memory_files TO app_rw;
GRANT SELECT, INSERT, DELETE ON memory_revisions TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON memory_chunks TO app_rw;
