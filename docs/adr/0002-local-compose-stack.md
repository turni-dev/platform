# ADR 0002: Local Compose Stack

## Status

Accepted

## Context

S1/E1 needs a local dependency stack before database schema, queues, MinIO-backed storage, and integration tests can land. Obsidian decisions require PostgreSQL with `pgvector(1024)` and `citext`, Redis for BullMQ, and MinIO for local S3-compatible storage.

## Decision

Use root `compose.yml` so the documented `docker compose up` command works from the repository root. The file starts four local services:

- `pgvector/pgvector:pg16` with `vector` and `citext` initialized.
- `redis-durable` on host port `6379` by default, with AOF, snapshots, `noeviction`, and a named volume for BullMQ.
- `redis-ephemeral` on host port `6380` by default, without persistence and with `allkeys-lru` for caches and pub/sub.
- `minio/minio:latest` for local object storage.

Local defaults are development-only and can be overridden through environment variables or an untracked `.env` file.

## Consequences

Developers can validate and start the local stack with standard Docker Compose commands. Queue state cannot be evicted by disposable cache data. Production database backup, PITR, production Redis sizing, and deploy containers remain separate S1/S5.5 tasks.
