# S1 E1 Database Schema V1 Design

## Goal

Implement the canonical PostgreSQL schema as owned Drizzle schemas and reviewed SQL migrations without collapsing bounded contexts into a shared database library.

## Ownership Map

- tenancy: tenants, locations, users, sessions, auth_codes, subscriptions, invoices.
- agent-core: agents, actions, bookings, idempotency_keys.
- channels: channel_connections, guests, conversations, messages, webhook_inbox.
- memory: memory_files, memory_revisions, memory_chunks.
- policy: policies, prompts, model_configs, eval_cases.
- approvals: approvals.
- reporting: events, usage_counters, payment_events.

apps/backend/src/platform/database owns only connection lifecycle, transactions, migration orchestration, and withTenant. A module does not import another module's infrastructure schema. Cross-context foreign keys are declared in SQL migrations.

## Database Laws

- Application-generated UUIDv7 identifiers; no random database UUID defaults.
- Tenant tables use tenant_id, ENABLE and FORCE RLS, and a fail-closed policy based on current_setting('app.tenant_id', true).
- FSM values are text plus CHECK, not PostgreSQL enums.
- Business foreign keys use ON DELETE RESTRICT; memory chunks and revisions may cascade as specified.
- Global prompt, model, and eval tables have no RLS and are read-only for app_rw.
- Events are range-partitioned from day one with a DEFAULT partition.
- citext, vector(1024), partial indexes, HNSW cosine, soft deletes, audit columns, and conversation sequence counters follow the Obsidian DDL note.

## Delivery Slices

Each slice is independently typechecked and tested and stays below the 400-line review limit:

1. Database foundation and tenancy.
2. Agent core and channels.
3. Memory and policy.
4. Approvals, reporting, billing, and migration orchestration.
5. DDL audit covering table inventory, FORCE RLS, policies, checks, partitioning, and grants.

## Review Boundary

Schema and migration paths are CODEOWNERS-protected. Implementation may be prepared autonomously, but the board card moves to Review, not Done, until founder review.
