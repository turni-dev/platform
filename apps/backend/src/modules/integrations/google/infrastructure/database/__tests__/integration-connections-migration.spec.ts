import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../migrations/0020_integration_connections.sql', import.meta.url);

describe('integration connections migration', () => {
  it('expands Google storage into a generic, allowlisted and tenant-isolated table', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain('CREATE TABLE integration_connections');
    expect(migration).toContain("provider_slug text NOT NULL CHECK (provider_slug IN ('google'))");
    expect(migration).toContain('INSERT INTO integration_connections');
    expect(migration).toContain('ALTER TABLE integration_connections FORCE ROW LEVEL SECURITY');
    expect(migration).not.toContain('DROP TABLE google_connections');
  });
});
