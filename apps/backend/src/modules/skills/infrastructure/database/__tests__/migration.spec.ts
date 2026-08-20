import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../migrations/0021_skills.sql', import.meta.url);

describe('skills migration', () => {
  it('creates the skills table with no tenant scoping', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain('CREATE TABLE skills');
    expect(migration).not.toContain('tenant_id');
    expect(migration).not.toContain('ENABLE ROW LEVEL SECURITY');
  });

  it('allows one active immutable version per slug', () => {
    return readFile(migrationUrl, 'utf8').then((migration) => {
      expect(migration).toContain(
        'CREATE UNIQUE INDEX skills_slug_version_uidx ON skills (slug, version)'
      );
      expect(migration).toContain(
        "CREATE UNIQUE INDEX skills_slug_active_uidx ON skills (slug) WHERE active"
      );
    });
  });

  it('protects published versions with triggers, not just grants', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain('CREATE TRIGGER skills_immutable_version');
    expect(migration).toContain('CREATE TRIGGER skills_no_delete');
    expect(migration).toContain("RAISE EXCEPTION 'skill versions are immutable'");
    expect(migration).toContain("RAISE EXCEPTION 'skill versions cannot be deleted'");
    expect(migration).toContain('GRANT SELECT, INSERT, UPDATE ON skills TO app_rw');
    expect(migration).not.toContain('DELETE ON skills TO app_rw');
  });
});
