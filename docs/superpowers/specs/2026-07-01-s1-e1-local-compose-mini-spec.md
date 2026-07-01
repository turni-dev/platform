# S1 E1 Local Compose Mini-Spec

## Card

`C1 [E1] Docker-compose local: Postgres+pgvector + Redis (durable BullMQ || ephemeral) + MinIO`

## Mini-Spec

- Goal: provide a local dependency stack for backend development without touching production infrastructure.
- Input: current Turni placeholder ops layout, Obsidian S1/E1 board, and RU-first/self-host Postgres decisions.
- Output: root `compose.yml`, local env example, and Postgres init SQL for `vector` and `citext`.
- Criteria: `docker compose config` validates the file; `docker compose up` can start Postgres, Redis, and MinIO when Docker daemon is running.
- Traps: do not commit real secrets; do not model production HA/PITR here; do not add app containers before backend deployment is designed.

## Notes

This slice keeps Redis as one local durable instance. The production note about durable and ephemeral Redis separation remains a future hardening task; local development starts with one Redis service unless tests prove the split is necessary.
