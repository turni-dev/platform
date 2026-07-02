CREATE TABLE channel_connections (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  type text NOT NULL CHECK (type IN ('telegram', 'widget')),
  credentials_enc text,
  webhook_secret text,
  allowed_origins text[],
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'error', 'disabled')),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE guests (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  phone_hash bytea,
  phone_enc text,
  phone_masked text,
  name text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE conversations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  guest_id uuid REFERENCES guests(id) ON DELETE RESTRICT,
  connection_id uuid NOT NULL
    REFERENCES channel_connections(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'handed_off', 'closed')),
  last_msg_at timestamptz,
  closed_at timestamptz,
  unread_count_for_owner integer NOT NULL DEFAULT 0
    CHECK (unread_count_for_owner >= 0),
  next_seq bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE conversations SET (fillfactor = 85);
CREATE TABLE messages (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL
    REFERENCES conversations(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  seq bigint NOT NULL,
  role text NOT NULL CHECK (role IN ('guest', 'agent', 'owner', 'system')),
  content text NOT NULL,
  content_tokens integer,
  verdict jsonb,
  latency_ms integer,
  prompt_ref text,
  model_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE webhook_inbox (
  id uuid PRIMARY KEY,
  source text NOT NULL CHECK (source IN ('telegram', 'yookassa')),
  external_id text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processed', 'failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX channel_connections_bot_active_uidx
  ON channel_connections (tenant_id, type, (meta ->> 'bot_username'))
  WHERE deleted_at IS NULL;
CREATE INDEX channel_connections_agent_idx ON channel_connections (agent_id);
CREATE UNIQUE INDEX guests_tenant_phone_uidx
  ON guests (tenant_id, phone_hash);
CREATE INDEX guests_tenant_last_seen_idx ON guests (tenant_id, last_seen_at);
CREATE INDEX conversations_tenant_last_msg_idx
  ON conversations (tenant_id, last_msg_at DESC);
CREATE UNIQUE INDEX messages_conversation_seq_uidx
  ON messages (conversation_id, seq);
CREATE INDEX messages_tenant_created_idx ON messages (tenant_id, created_at);
CREATE UNIQUE INDEX webhook_inbox_source_external_uidx
  ON webhook_inbox (source, external_id);
ALTER TABLE channel_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE guests FORCE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
CREATE POLICY channel_connections_tenant_isolation ON channel_connections
  FOR ALL TO app_rw
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY guests_tenant_isolation ON guests
  FOR ALL TO app_rw
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY conversations_tenant_isolation ON conversations
  FOR ALL TO app_rw
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY messages_tenant_isolation ON messages
  FOR ALL TO app_rw
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON channel_connections TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON guests TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON conversations TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON messages TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_inbox TO app_rw;
