# S1 E1 Tenant RLS Design

## Goal

Provide one fail-closed transaction boundary for every tenant-scoped API or
worker operation and prove PostgreSQL RLS isolation with two tenants.

## Input And Output

- Input: a transactional database, a tenant UUID, and an async operation.
- Output: the operation result after transaction-local tenant context is set
  and verified.
- Invalid UUIDs and context mismatches fail before business SQL runs.

## Acceptance Criteria

- `set_config('app.tenant_id', tenantId, true)` is the first transaction SQL.
- `current_setting('app.tenant_id', true)` is asserted before the callback.
- Context cannot leak after commit or rollback.
- An integration test proves tenant A cannot read tenant B and no context sees
  no tenant rows through `app_rw`.
- CI rejects `sql.raw(` in backend source.

## Traps

- Never use session-level `SET` with a pool.
- Never expose a database handle to worker handlers outside `withTenant`.
- Run destructive integration setup only when `RLS_TEST_DATABASE_URL` is set.
