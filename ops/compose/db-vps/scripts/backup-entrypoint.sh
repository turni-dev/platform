#!/usr/bin/env sh
set -eu

BACKUP_ROOT="${BACKUP_ROOT:-/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "${BACKUP_ROOT}/logical" "${BACKUP_ROOT}/base" "${BACKUP_ROOT}/metadata"

require_env() {
  name="$1"
  eval "value=\${${name}:-}"
  if [ -z "${value}" ]; then
    echo "${name} is required" >&2
    exit 2
  fi
}

prune_backups() {
  directory="$1"
  pattern="$2"
  find "${directory}" -type f -name "${pattern}" -mtime "+${BACKUP_RETENTION_DAYS}" -delete
}

logical_backup() {
  require_env PGDATABASE
  output="${BACKUP_ROOT}/logical/${PGDATABASE}_${TIMESTAMP}.dump"
  pg_dump --format=custom --no-owner --no-privileges --file="${output}"
  sha256sum "${output}" > "${output}.sha256"
  prune_backups "${BACKUP_ROOT}/logical" "*.dump"
  prune_backups "${BACKUP_ROOT}/logical" "*.dump.sha256"
  echo "logical backup: ${output}"
}

base_backup() {
  require_env PGDATABASE
  target="${BACKUP_ROOT}/base/${PGDATABASE}_${TIMESTAMP}"
  mkdir -p "${target}"
  pg_basebackup \
    --pgdata="${target}" \
    --format=tar \
    --gzip \
    --wal-method=stream \
    --checkpoint=fast \
    --label="turni-${TIMESTAMP}"
  find "${target}" -type f -exec sha256sum {} \; > "${target}/SHA256SUMS"
  find "${BACKUP_ROOT}/base" -mindepth 1 -maxdepth 1 -type d -mtime "+${BACKUP_RETENTION_DAYS}" -exec rm -rf {} +
  echo "base backup: ${target}"
}

archive_status() {
  psql --tuples-only --no-align --command \
    "SELECT now(), archived_count, failed_count, last_archived_wal, last_failed_wal FROM pg_stat_archiver;"
}

case "${1:-all}" in
  logical)
    logical_backup
    ;;
  base)
    base_backup
    ;;
  archive-status)
    archive_status
    ;;
  all)
    archive_status
    logical_backup
    base_backup
    ;;
  *)
    echo "Usage: backup-entrypoint.sh [logical|base|archive-status|all]" >&2
    exit 2
    ;;
esac
