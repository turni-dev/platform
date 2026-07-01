# ADR 0002: Local Compose Stack

## Status

Accepted

## Context

S1/E1 needs a local dependency stack before database schema, queues, MinIO-backed storage, and integration tests can land. Obsidian decisions require PostgreSQL with `pgvector(1024)` and `citext`, Redis for BullMQ, and MinIO for local S3-compatible storage.

## Decision

Use root `compose.yml` so the documented `docker compose up` command works from the repository root. The file starts three local services:

- `pgvector/pgvector:pg16` with `vector` and `citext` initialized.
- `redis:7.4-alpine` with AOF enabled.
- `minio/minio:latest` for local object storage.

Local defaults are development-only and can be overridden through environment variables or an untracked `.env` file.

## Consequences

Developers can validate and start the local stack with standard Docker Compose commands. Production database backup, PITR, separate Redis roles, and deploy containers remain separate S1/S5.5 tasks.
