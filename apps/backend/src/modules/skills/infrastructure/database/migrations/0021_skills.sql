CREATE TABLE skills (
  id uuid PRIMARY KEY,
  slug text NOT NULL,
  version integer NOT NULL,
  capability_id text NOT NULL,
  input_schema jsonb NOT NULL,
  output_schema jsonb NOT NULL,
  permissions text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT skills_version_check CHECK (version > 0)
);

CREATE UNIQUE INDEX skills_slug_version_uidx ON skills (slug, version);
CREATE UNIQUE INDEX skills_slug_active_uidx ON skills (slug) WHERE active;

CREATE FUNCTION protect_skill_version()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id OR
     OLD.slug IS DISTINCT FROM NEW.slug OR
     OLD.version IS DISTINCT FROM NEW.version OR
     OLD.capability_id IS DISTINCT FROM NEW.capability_id OR
     OLD.input_schema IS DISTINCT FROM NEW.input_schema OR
     OLD.output_schema IS DISTINCT FROM NEW.output_schema OR
     OLD.permissions IS DISTINCT FROM NEW.permissions OR
     OLD.created_by IS DISTINCT FROM NEW.created_by OR
     OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'skill versions are immutable';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER skills_immutable_version
  BEFORE UPDATE ON skills
  FOR EACH ROW EXECUTE FUNCTION protect_skill_version();

CREATE FUNCTION reject_skill_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'skill versions cannot be deleted';
END
$$;
CREATE TRIGGER skills_no_delete
  BEFORE DELETE ON skills
  FOR EACH ROW EXECUTE FUNCTION reject_skill_delete();

GRANT SELECT, INSERT, UPDATE ON skills TO app_rw;
