import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const composePath = 'ops/compose/db-vps/compose.yml';
const dockerfilePath = 'ops/containers/postgres-db-vps/Dockerfile';
const backupScriptPath = 'ops/compose/db-vps/scripts/backup-entrypoint.sh';
const runbookPath = 'docs/runbooks/db-vps-postgres-backups.md';

describe('DB VPS compose backup contract', () => {
  it('enables WAL archiving and separates data, WAL archive, and backup volumes', async () => {
    const compose = await readFile(composePath, 'utf8');

    assert.match(compose, /turni\/postgres-db-vps:pg16/);
    assert.match(compose, /wal_level=replica/);
    assert.match(compose, /archive_mode=on/);
    assert.match(compose, /archive_command=test ! -f \/var\/lib\/postgresql\/wal-archive\/%f && cp %p \/var\/lib\/postgresql\/wal-archive\/%f/);
    assert.match(compose, /turni-db-data:/);
    assert.match(compose, /turni-db-wal-archive:/);
    assert.match(compose, /turni-db-backups:/);
  });

  it('provides one-off backup and S3 sync services', async () => {
    const compose = await readFile(composePath, 'utf8');

    assert.match(compose, /postgres-backup:/);
    assert.match(compose, /backup-sync:/);
    assert.match(compose, /profiles: \["backup"\]/);
    assert.match(compose, /S3_ENDPOINT/);
    assert.match(compose, /S3_BUCKET/);
    assert.match(compose, /mc mirror --overwrite \/backups/);
    assert.match(compose, /mc mirror --overwrite \/wal-archive/);
  });

  it('prepares writable WAL archive permissions in the Postgres image', async () => {
    const compose = await readFile(composePath, 'utf8');
    const dockerfile = await readFile(dockerfilePath, 'utf8');

    assert.match(compose, /postgres-db-vps/);
    assert.match(dockerfile, /FROM pgvector\/pgvector:pg16/);
    assert.match(dockerfile, /mkdir -p \/var\/lib\/postgresql\/wal-archive/);
    assert.match(dockerfile, /chown -R postgres:postgres \/var\/lib\/postgresql\/wal-archive/);
  });

  it('creates logical and base backups with retention pruning', async () => {
    const script = await readFile(backupScriptPath, 'utf8');

    assert.match(script, /pg_dump/);
    assert.match(script, /--format=custom/);
    assert.match(script, /pg_basebackup/);
    assert.match(script, /--wal-method=stream/);
    assert.match(script, /prune_backups "\$\{BACKUP_ROOT\}\/logical" "\*\.dump"/);
    assert.match(script, /BACKUP_RETENTION_DAYS/);
  });

  it('documents restore drill and secret handling', async () => {
    const runbook = await readFile(runbookPath, 'utf8');

    assert.match(runbook, /restore-drill/i);
    assert.match(runbook, /sops/i);
    assert.match(runbook, /S3/i);
    assert.match(runbook, /pg_restore/);
    assert.match(runbook, /restore_command/);
  });
});
