CREATE TABLE policies (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  path text NOT NULL,
  layer text NOT NULL,
  compiled jsonb NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT policies_layer_check CHECK (layer IN ('locked', 'custom'))
);
CREATE TABLE prompts (
  id uuid PRIMARY KEY,
  key text NOT NULL,
  version integer NOT NULL,
  content text NOT NULL,
  model_hints jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prompts_version_check CHECK (version > 0)
);
CREATE TABLE model_configs (
  id uuid PRIMARY KEY,
  role text NOT NULL,
  tier text NOT NULL,
  model_id text NOT NULL,
  price_in numeric(8, 4),
  price_out numeric(8, 4),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT model_configs_role_check
    CHECK (role IN ('classify', 'generate', 'summarize', 'judge', 'embed')),
  CONSTRAINT model_configs_tier_check
    CHECK (tier IN ('cheap', 'main', 'premium'))
);
CREATE TABLE eval_cases (
  id uuid PRIMARY KEY,
  vertical text NOT NULL,
  input text NOT NULL,
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  golden text,
  risk_label text NOT NULL,
  must_refuse boolean NOT NULL DEFAULT false,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eval_cases_risk_label_check
    CHECK (risk_label IN ('safe', 'risky', 'blocked')),
  CONSTRAINT eval_cases_source_check
    CHECK (source IN ('manual', 'edited', 'synthetic'))
);

CREATE UNIQUE INDEX policies_agent_path_uidx ON policies (agent_id, path);
CREATE INDEX policies_tenant_agent_idx ON policies (tenant_id, agent_id);
CREATE UNIQUE INDEX prompts_key_version_uidx ON prompts (key, version);
CREATE UNIQUE INDEX prompts_key_active_uidx ON prompts (key) WHERE active = true;
CREATE UNIQUE INDEX model_configs_role_tier_model_uidx
  ON model_configs (role, tier, model_id);
CREATE INDEX eval_cases_vertical_risk_idx ON eval_cases (vertical, risk_label);

CREATE FUNCTION protect_prompt_version()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id OR
     OLD.key IS DISTINCT FROM NEW.key OR
     OLD.version IS DISTINCT FROM NEW.version OR
     OLD.content IS DISTINCT FROM NEW.content OR
     OLD.model_hints IS DISTINCT FROM NEW.model_hints OR
     OLD.created_by IS DISTINCT FROM NEW.created_by OR
     OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'prompt versions are immutable';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER prompts_immutable_version
  BEFORE UPDATE ON prompts
  FOR EACH ROW EXECUTE FUNCTION protect_prompt_version();

CREATE FUNCTION reject_prompt_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'prompt versions cannot be deleted';
END
$$;
CREATE TRIGGER prompts_no_delete
  BEFORE DELETE ON prompts
  FOR EACH ROW EXECUTE FUNCTION reject_prompt_delete();

ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies FORCE ROW LEVEL SECURITY;
CREATE POLICY policies_tenant_isolation ON policies
  FOR ALL TO app_rw
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY policies_locked_update ON policies
  AS RESTRICTIVE FOR UPDATE TO app_rw
  USING (layer <> 'locked')
  WITH CHECK (layer <> 'locked');
CREATE POLICY policies_locked_delete ON policies
  AS RESTRICTIVE FOR DELETE TO app_rw
  USING (layer <> 'locked');

GRANT SELECT, INSERT, UPDATE, DELETE ON policies TO app_rw;
GRANT SELECT ON prompts TO app_rw;
REVOKE INSERT, UPDATE, DELETE ON prompts FROM app_rw;
GRANT SELECT ON model_configs TO app_rw;
REVOKE INSERT, UPDATE, DELETE ON model_configs FROM app_rw;
GRANT SELECT ON eval_cases TO app_rw;
REVOKE INSERT, UPDATE, DELETE ON eval_cases FROM app_rw;
