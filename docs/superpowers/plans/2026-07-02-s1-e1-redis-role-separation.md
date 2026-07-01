# S1 E1 Redis Role Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolate durable BullMQ state from disposable Redis data in local development.

**Architecture:** Define two Redis services from the same pinned image. Give only the BullMQ service persistent storage and `noeviction`; configure the disposable service without AOF/snapshots and with an LRU eviction policy.

**Tech Stack:** Docker Compose, Redis 7.4 Alpine, PowerShell JSON assertions

---

### Task 1: Prove the topology is missing

**Files:**
- Inspect: `compose.yml`

- [x] **Step 1: Parse the rendered Compose model**

Run a PowerShell assertion against `docker compose config --format json` requiring `redis-durable` and `redis-ephemeral`.

- [x] **Step 2: Verify RED**

Expected: fail because the current model has only `redis`.

### Task 2: Split Redis roles

**Files:**
- Modify: `compose.yml`
- Modify: `docs/adr/0002-local-compose-stack.md`

- [x] **Step 1: Add durable Redis**

Rename the existing service to `redis-durable`, retain the named volume, and add `--maxmemory-policy noeviction`.

- [x] **Step 2: Add ephemeral Redis**

Use port `${REDIS_EPHEMERAL_PORT:-6380}:6379`, `--appendonly no`, `--save ""`, and `--maxmemory-policy allkeys-lru`, without a volume.

- [x] **Step 3: Verify GREEN**

Run the JSON assertions and `docker compose config --quiet`.

- [x] **Step 4: Run repository verification**

Run `$env:NX_DAEMON='false'; npm run nx -- run-many -t test lint typecheck coverage build` and `git diff --check`.

- [x] **Step 5: Commit and synchronize the board**

Commit as `chore: separate redis roles` and move the card from `В работе` to `Готово`.
