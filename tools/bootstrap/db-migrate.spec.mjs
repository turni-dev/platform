import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checksumMigration,
  discoverMigrations,
  validateMigrations
} from './db-migrate.mjs';

const modulesUrl = new URL('../../apps/backend/src/modules/', import.meta.url);

describe('database migration runner', () => {
  it('discovers the globally ordered migration chain', async () => {
    const migrations = await discoverMigrations(modulesUrl);

    assert.deepEqual(
      migrations.map((migration) => migration.name),
      [
        '0001_tenancy.sql',
        '0002_agent_core.sql',
        '0003_channels.sql',
        '0004_agent_core_channel_fks.sql',
        '0005_memory.sql',
        '0006_memory_hnsw.concurrent.sql',
        '0007_policy.sql',
        '0008_approvals.sql',
        '0009_memory_approval_fk.sql',
        '0010_reporting.sql',
        '0011_tenancy_billing.sql'
      ]
    );
    assert.equal(migrations[5]?.transactional, false);
    assert.equal(migrations[4]?.transactional, true);
  });

  it('rejects duplicate global sequence numbers', () => {
    assert.throws(
      () =>
        validateMigrations([
          { name: '0001_first.sql', path: 'a', transactional: true },
          { name: '0001_second.sql', path: 'b', transactional: true }
        ]),
      /duplicate migration sequence 0001/
    );
  });

  it('uses stable SHA-256 checksums', () => {
    assert.equal(
      checksumMigration('SELECT 1;'),
      '17db4fd369edb9244b9f91d9aeed145c3d04ad8ba6e95d06247f07a63527d11a'
    );
    assert.notEqual(checksumMigration('SELECT 1;'), checksumMigration('SELECT 2;'));
  });
});
