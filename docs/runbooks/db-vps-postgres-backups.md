# DB-VPS Postgres Backups Runbook

This runbook covers the self-hosted PostgreSQL DB-VPS deployed with Docker Compose.

Source of truth: Obsidian decisions require self-host Postgres with pgvector/citext, WAL/PITR backups, daily `pg_dump`, 30-day retention, and a quarterly restore-drill.

## Files

- Compose: `ops/compose/db-vps/compose.yml`
- Environment template: `ops/compose/db-vps/.env.example`
- Backup entrypoint: `ops/compose/db-vps/scripts/backup-entrypoint.sh`

Secrets must come from sops/server environment, not from committed files.

## Deploy

On the DB-VPS:

```bash
cd /opt/turni/platform
cp ops/compose/db-vps/.env.example ops/compose/db-vps/.env
chmod 600 ops/compose/db-vps/.env
# Fill POSTGRES_PASSWORD and S3 credentials from sops-managed values.
docker compose --env-file ops/compose/db-vps/.env -f ops/compose/db-vps/compose.yml up -d postgres
```

The Postgres service enables:

- `wal_level=replica`
- `archive_mode=on`
- `archive_timeout=60s`
- non-overwriting `archive_command`
- separate volumes for data, WAL archive, and backups

## Daily Backup

Run from cron/systemd timer on the DB-VPS:

```bash
docker compose --env-file ops/compose/db-vps/.env -f ops/compose/db-vps/compose.yml --profile backup run --rm postgres-backup all
docker compose --env-file ops/compose/db-vps/.env -f ops/compose/db-vps/compose.yml --profile backup run --rm backup-sync
```

This creates:

- logical backup: `pg_dump --format=custom`
- base backup: `pg_basebackup --format=tar --gzip --wal-method=stream`
- WAL archive sync to S3-compatible storage

Retention is controlled by `BACKUP_RETENTION_DAYS`, default `30`.

## WAL Archive Health

Check archiver state:

```bash
docker compose --env-file ops/compose/db-vps/.env -f ops/compose/db-vps/compose.yml --profile backup run --rm postgres-backup archive-status
```

Alert manually or through monitoring if:

- `failed_count` increases;
- `last_failed_wal` is not empty;
- DB disk usage grows unexpectedly;
- S3 sync fails.

## Restore-Drill

Run at least quarterly and before the first paid pilot.

1. Provision a clean throwaway restore host or local isolated Docker volume.
2. Download one base backup and the WAL archive prefix from S3.
3. Extract the base backup tarball into a clean Postgres data directory.
4. Create `postgresql.auto.conf` or append config with:

```conf
restore_command = 'cp /restore/wal-archive/%f %p'
recovery_target_time = 'YYYY-MM-DD HH:MM:SS+00'
```

5. Start Postgres and wait for recovery to complete.
6. Verify extensions:

```sql
SELECT extname FROM pg_extension WHERE extname IN ('vector', 'citext');
```

7. Verify logical backup readability:

```bash
createdb turni_restore_check
pg_restore --dbname=turni_restore_check /restore/logical/latest.dump
```

8. Record restore-drill date, backup timestamp, recovery target, and result in the private ops register.

## Notes

- `pg_dump` is a logical backup and is not enough for PITR by itself.
- PITR requires a base backup plus a continuous WAL archive.
- The archive command must not overwrite existing WAL files.
- Keep the age private identity backup separately; encrypted DB backups are useless without the decryption path.

References:

- PostgreSQL 16 continuous archiving and PITR: https://www.postgresql.org/docs/16/continuous-archiving.html
- PostgreSQL 16 `pg_basebackup`: https://www.postgresql.org/docs/16/app-pgbasebackup.html
- PostgreSQL 16 `pg_dump`: https://www.postgresql.org/docs/16/app-pgdump.html
