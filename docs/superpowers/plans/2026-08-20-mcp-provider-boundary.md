# MCP Provider Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route the existing Google Calendar and Sheets capabilities through one typed, allowlisted `McpPort` and migrate their encrypted tenant connection storage to `integration_connections`.

**Architecture:** `McpPort` discovers and invokes capabilities owned by a first-party provider registry. Only `google` is registered in M1; the generic connection schema permits future reviewed providers but has no custom-provider path. Existing OAuth routes retain their public Google-specific UX while repositories store an `IntegrationConnection` with `providerSlug = 'google'`.

**Tech Stack:** TypeScript strict mode, Zod 4, NestJS/Fastify, Drizzle/Postgres, RLS, Vitest.

---

### Task 1: Define the generic MCP contracts

**Files:**
- Create: `packages/contracts/src/ports/mcp.ts`
- Create: `packages/contracts/src/ports/__tests__/mcp.spec.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Write the failing contract tests**

```ts
it('accepts only named read or write capabilities', () => {
  expect(McpCapabilitySchema.parse({
    id: 'google.calendar.events.create', providerSlug: 'google', operation: 'write'
  })).toMatchObject({ operation: 'write' });
  expect(() => McpCapabilitySchema.parse({
    id: 'google.bad space', providerSlug: 'google', operation: 'execute'
  })).toThrow();
});
```

- [ ] **Step 2: Run the test and observe its import failure**

Run: `npx vitest run --config vitest.config.ts packages/contracts/src/ports/__tests__/mcp.spec.ts`

- [ ] **Step 3: Add `mcp.ts` with a boundary that carries no vendor types**

```ts
export const McpOperationSchema = z.enum(['read', 'write']);
export const McpCapabilitySchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/),
  providerSlug: z.string().regex(/^[a-z][a-z0-9-]*$/),
  operation: McpOperationSchema
});
export interface McpPort {
  discover(input: McpDiscoveryInput): Promise<readonly McpCapability[]>;
  invoke(input: McpInvocation): Promise<McpInvocationResult>;
}
```

Use Zod schemas for every concrete DTO, export the port from `index.ts`, and model dynamic invocation payloads as validated JSON values rather than `any`.

- [ ] **Step 4: Run the contract test and strict typecheck**

Run: `npx vitest run --config vitest.config.ts packages/contracts/src/ports/__tests__/mcp.spec.ts && npx tsc -p packages/contracts/tsconfig.lib.json --noEmit`

- [ ] **Step 5: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): add MCP capability port"
```

### Task 2: Implement the allowlisted provider registry and Google provider

**Files:**
- Create: `apps/backend/src/modules/integrations/mcp/application/mcp-provider.ts`
- Create: `apps/backend/src/modules/integrations/mcp/application/first-party-mcp-registry.ts`
- Create: `apps/backend/src/modules/integrations/mcp/application/__tests__/first-party-mcp-registry.spec.ts`
- Create: `apps/backend/src/modules/integrations/google/application/google-mcp-provider.ts`
- Create: `apps/backend/src/modules/integrations/google/application/__tests__/google-mcp-provider.spec.ts`

- [ ] **Step 1: Write the failing registry test**

```ts
it('discovers Google capabilities and rejects an unallowlisted provider', async () => {
  const registry = new FirstPartyMcpRegistry([googleProvider]);
  expect(await registry.discover({ tenantId, agentId })).toHaveLength(4);
  await expect(registry.invoke({ providerSlug: 'other', capabilityId: 'other.read', input: {} }))
    .rejects.toBeInstanceOf(McpProviderNotAllowedError);
});
```

- [ ] **Step 2: Verify red**

Run: `npx vitest run --config vitest.config.ts apps/backend/src/modules/integrations/mcp/application/__tests__/first-party-mcp-registry.spec.ts`

- [ ] **Step 3: Add narrow provider interfaces and Google mapping**

`McpProvider` owns a descriptor and validates each capability input before it calls an internal adapter. `GoogleMcpProvider` maps only the four approved IDs to the existing Calendar/Sheets adapters; it does not export or accept a Google SDK type. Its Fake has the same capability IDs and records calls.

- [ ] **Step 4: Add provider tests for each read/write mapping and Zod rejection**

```ts
it('does not call the append adapter when its input fails the capability schema', async () => {
  await expect(provider.invoke(badAppend)).rejects.toBeInstanceOf(z.ZodError);
  expect(fakeSheets.appendCalls).toEqual([]);
});
```

- [ ] **Step 5: Run scoped tests and commit**

Run: `npx vitest run --config vitest.config.ts apps/backend/src/modules/integrations/mcp apps/backend/src/modules/integrations/google/application/__tests__/google-mcp-provider.spec.ts`

```bash
git add apps/backend/src/modules/integrations/mcp apps/backend/src/modules/integrations/google/application
git commit -m "feat(google): expose Calendar and Sheets through MCP"
```

### Task 3: Expand storage to generic tenant integration connections

**Files:**
- Create: `apps/backend/src/modules/integrations/google/infrastructure/database/migrations/0020_integration_connections.sql`
- Modify: `apps/backend/src/modules/integrations/google/infrastructure/database/schema.ts`
- Modify: `apps/backend/src/modules/integrations/google/infrastructure/database/__tests__/migration.spec.ts`
- Create: `apps/backend/src/modules/integrations/google/infrastructure/database/__tests__/integration-connections-migration.spec.ts`

- [ ] **Step 1: Write failing migration tests**

```ts
expect(migration).toContain('CREATE TABLE integration_connections');
expect(migration).toContain("provider_slug text NOT NULL CHECK (provider_slug IN ('google'))");
expect(migration).toContain('INSERT INTO integration_connections');
expect(migration).toContain('FORCE ROW LEVEL SECURITY');
```

- [ ] **Step 2: Verify red**

Run: `npx vitest run --config vitest.config.ts apps/backend/src/modules/integrations/google/infrastructure/database/__tests__/integration-connections-migration.spec.ts`

- [ ] **Step 3: Add expand/contract migration and Drizzle schema**

Create `integration_connections` with `provider_slug`, `provider_version`,
`credentials_enc`, `resources`, `granted_scopes`, `meta`, lifecycle fields and
the existing tenant policy. Copy every `google_connections` row with provider
`google`; do not drop the old table in this migration. Drizzle uses the new
table as the application schema.

- [ ] **Step 4: Run migration tests and commit**

Run: `npx vitest run --config vitest.config.ts apps/backend/src/modules/integrations/google/infrastructure/database/__tests__`

```bash
git add apps/backend/src/modules/integrations/google/infrastructure/database
git commit -m "feat(integrations): add generic connection storage"
```

### Task 4: Migrate the Google repository and consent service

**Files:**
- Create: `apps/backend/src/modules/integrations/mcp/application/integration-connection-repository.port.ts`
- Create: `apps/backend/src/modules/integrations/mcp/infrastructure/database/postgres-integration-connection-repository.ts`
- Modify: `apps/backend/src/modules/integrations/google/application/google-connection-service.ts`
- Modify: `apps/backend/src/modules/integrations/google/application/google-connection-repository.port.ts`
- Modify: `apps/backend/src/modules/integrations/google/infrastructure/database/postgres-google-connection-repository.ts`
- Modify: `apps/backend/src/modules/integrations/google/**/__tests__/*.spec.ts`

- [ ] **Step 1: Write failing repository and service tests against generic storage**

```ts
expect(await connections.findByTenantAndProvider(tenantId, 'google'))
  .toMatchObject({ providerSlug: 'google', status: 'active' });
expect(stored.credentialsEncrypted).not.toContain(refreshToken);
```

- [ ] **Step 2: Verify red**

Run: `npx vitest run --config vitest.config.ts apps/backend/src/modules/integrations/google/application/__tests__/google-connection-service.spec.ts`

- [ ] **Step 3: Change Google code only at the repository boundary**

OAuth continues to request and select Google resources, but writes and reads a
generic connection constrained to `providerSlug: 'google'`. The summary DTO
remains field-by-field and never gains credentials. Refresh-token rotation uses
the generic encrypted credential column under `withTenant`.

- [ ] **Step 4: Run Google service, repository and route tests; commit**

Run: `npx vitest run --config vitest.config.ts apps/backend/src/modules/integrations/google apps/backend/src/entrypoints/http/__tests__/google-integration-routes.spec.ts`

```bash
git add apps/backend/src/modules/integrations apps/backend/src/entrypoints/http
git commit -m "refactor(google): use generic integration connections"
```

### Task 5: Wire the runtime boundary without creating a bypass

**Files:**
- Modify: `apps/backend/src/entrypoints/http/main.ts`
- Create: `apps/backend/src/modules/integrations/mcp/application/__tests__/mcp-composition.spec.ts`
- Modify: Google adapter and Fake imports that are consumed by composition

- [ ] **Step 1: Write failing composition tests**

```ts
it('registers only Google and supplies its Fake in test composition', () => {
  expect(mcpPort.discover(context).map((item) => item.providerSlug)).toEqual(['google']);
});
```

- [ ] **Step 2: Verify red, compose the registry, then verify green**

Run: `npx vitest run --config vitest.config.ts apps/backend/src/modules/integrations/mcp/application/__tests__/mcp-composition.spec.ts`

Do not add a direct HTTP execution route. Agent/automation execution is not
yet wired in this repository, so the only callable Google surface remains the
owner OAuth wizard. The port is composed for its future consumers, and its
provider APIs are internal.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/entrypoints/http/main.ts apps/backend/src/modules/integrations/mcp
git commit -m "feat(backend): compose first-party MCP registry"
```

### Task 6: Verify the full migration and live-data readiness

**Files:**
- Modify: `docs/superpowers/specs/2026-08-20-mcp-provider-boundary-design.md`

- [ ] **Step 1: Run all affected tests and typechecks**

Run:

```bash
npx vitest run --config vitest.config.ts apps/backend/src/platform/integrations/google apps/backend/src/modules/integrations apps/backend/src/entrypoints/http/__tests__/google-integration-routes.spec.ts packages/contracts/src/ports
npx tsc -p apps/backend/tsconfig.app.json --noEmit
npx tsc -p packages/contracts/tsconfig.lib.json --noEmit
```

Expected: all suites pass and both compilers exit 0.

- [ ] **Step 2: Verify migration safety statically**

Run: `git diff --check && rg -n -S "DROP TABLE google_connections|credentials_enc.*send\(|refresh_token.*send\(" apps/backend packages/contracts`

Expected: no whitespace errors, no destructive old-table drop and no secret DTO leak.

- [ ] **Step 3: Record the production handoff**

Document that a deploy operator must run `npm run db:migrate` and, under two
different `withTenant` contexts, confirm copied Google rows are visible only to
their original tenant before the old table can be contracted.

- [ ] **Step 4: Commit verification documentation**

```bash
git add docs/superpowers/specs/2026-08-20-mcp-provider-boundary-design.md
git commit -m "docs: record MCP migration verification"
```
