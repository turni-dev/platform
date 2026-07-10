# S1 E1 Database Schema V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver the canonical Turni PostgreSQL v1 schema with Drizzle definitions, reviewed SQL, and fail-closed tenant isolation.

**Architecture:** Each bounded context owns its schema and migrations. Platform database code provides the Postgres.js and Drizzle connection, transaction-scoped tenant context, and ordered migration orchestration without owning business tables.

**Tech Stack:** TypeScript 5.9, Drizzle ORM and Kit, Postgres.js, PostgreSQL 16, pgvector, citext, Vitest

---

### Task 1: Database foundation and tenancy

**Files:**
- Create: drizzle.config.ts
- Create: apps/backend/src/platform/database/client.ts
- Create: apps/backend/src/platform/database/with-tenant.ts
- Create: apps/backend/src/modules/tenancy/infrastructure/database/schema.ts
- Create: apps/backend/src/modules/tenancy/infrastructure/database/schema.spec.ts
- Create: apps/backend/src/modules/tenancy/infrastructure/database/migrations/0001_tenancy.sql

- [ ] Write a failing schema inventory test for five tenancy tables.
- [ ] Define UUID, citext, JSONB, CHECK, partial unique, and index metadata.
- [ ] Add ENABLE and FORCE RLS plus fail-closed policies in SQL.
- [ ] Add connection lifecycle and transaction-local tenant context tests.
- [ ] Commit the green tenancy slice.

### Task 2: Agent core and channels

**Files:**
- Create schemas and tests under modules/agent-core/infrastructure/database.
- Create schemas and tests under modules/channels/infrastructure/database.
- Create ordered migrations in each owning module.

- [ ] Add agents, actions, bookings, and idempotency keys.
- [ ] Add channel connections, guests, conversations, messages, and webhook inbox.
- [ ] Verify text CHECK values, soft-delete indexes, next sequence counter, and restrictive FKs.
- [ ] Commit the green interaction slice.

### Task 3: Memory and policy

**Files:**
- Create schemas, tests, and migrations under modules/memory/infrastructure/database.
- Create schemas, tests, and migrations under modules/policy/infrastructure/database.

- [ ] Add files, immutable revisions, chunks, vector(768), and HNSW cosine metadata; keep the 768-dimensional embedding model decision aligned with ADR 0005.
- [ ] Add tenant policies and global prompts, model configs, and eval cases.
- [ ] Revoke global mutations from app_rw and add immutable-row triggers.
- [ ] Commit the green knowledge and policy slice.

### Task 4: Approvals and reporting

**Files:**
- Create schemas, tests, and migrations under modules/approvals/infrastructure/database.
- Create schemas, tests, and migrations under modules/reporting/infrastructure/database.

- [ ] Add exclusive-target approval CHECK and pending partial index.
- [ ] Add partitioned events with DEFAULT partition and event indexes.
- [ ] Add usage counters and payment events.
- [ ] Commit the green operations slice.

### Task 5: Migration and DDL audit

**Files:**
- Modify: tools/bootstrap/db-migrate-placeholder.mjs
- Create: tools/bootstrap/db-migrate.mjs
- Create: apps/backend/src/platform/database/schema-audit.spec.ts

- [ ] Run migrations in deterministic context order.
- [ ] Assert table inventory, FORCE RLS policies, global grants, checks, and partitioning from migration SQL.
- [ ] Run all Nx checks and Docker Compose validation.
- [ ] Move the board card to Review for required founder approval.
