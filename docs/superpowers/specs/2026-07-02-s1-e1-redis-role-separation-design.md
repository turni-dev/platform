# S1 E1 Redis Role Separation Design

## Goal

Separate durable BullMQ data from disposable cache and pub/sub data in the local Compose stack.

## Decision

Run two Redis 7.4 services:

- `redis-durable` on host port `6379` by default, with AOF, periodic snapshots, `noeviction`, and a named volume.
- `redis-ephemeral` on host port `6380` by default, with persistence disabled and `allkeys-lru`.

Both services have independent healthchecks. Environment variables expose both host ports. Logical databases or key prefixes are rejected because persistence and eviction policy apply to the whole Redis process and would not isolate BullMQ from caches.

## Verification

Parse `docker compose config --format json` and assert service commands, port bindings, and durable-only storage. Then run the repository CI-equivalent checks.
