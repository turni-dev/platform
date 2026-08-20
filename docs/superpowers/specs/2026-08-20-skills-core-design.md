# Skills Core: immutable skill definition and registry — design

## Decision

Introduce the first building block of the platform's capability registry
described in
[`2026-08-20-mcp-marketplace-composable-profiles-design.md`](2026-08-20-mcp-marketplace-composable-profiles-design.md):
a `Skill` is a versioned, immutable wrapper around exactly one MCP capability,
with an explicit input/output schema and a minimum-permission scope list. A
new `skills` backend module owns a Postgres-backed registry that stores,
versions and activates skill definitions. This ticket (C2a) covers definition
and registry only — invocation, write-access policy and agent-profile
composition are later tickets.

## Model

- A skill wraps one `McpCapabilityId` (`packages/contracts/src/ports/mcp.ts`).
  It never carries its own executable logic — execution always delegates to
  `McpPort.invoke` (a later ticket).
- Publishing a skill creates a new, immutable, monotonically versioned row —
  the same shape as `prompts` in
  `apps/backend/src/modules/policy/infrastructure/database/schema.ts` (`key`
  + `version`, `active` flag, at most one active version per key).
- A skill's `inputSchema`/`outputSchema` are stored as JSON Schema objects in
  `jsonb`. Only their shape (a JSON object) is validated at this layer;
  semantic JSON Schema validation of a skill invocation payload is out of
  scope for this ticket.
- `permissions` is an array of namespaced scope strings (e.g.
  `calendar.events.write`), reusing the `McpCapabilityId` dot-namespaced
  pattern. A policy engine compares these against an allowlist in a later
  ticket; this ticket only stores and returns them.

## Contracts (`packages/contracts/src/ports/skill.ts`)

New port module, mirroring the existing split in `ports/mcp.ts` (schemas +
port interface, no error classes):

- `SkillSlugSchema` — `^[a-z][a-z0-9-]*$` (same shape as
  `McpProviderSlugSchema`).
- `SkillPermissionScopeSchema` — `^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$` (same
  shape as `McpCapabilityIdSchema`).
- `JsonSchemaObjectSchema` — `z.record(z.string(), z.json())`; validates "is a
  JSON object", not JSON Schema semantics.
- `SkillDefinitionSchema` (`z.strictObject`): `id: UuidSchema`, `slug:
  SkillSlugSchema`, `version: z.number().int().positive()`, `capabilityId:
  McpCapabilityIdSchema`, `inputSchema: JsonSchemaObjectSchema`,
  `outputSchema: JsonSchemaObjectSchema`, `permissions:
  z.array(SkillPermissionScopeSchema).max(20)`, `active: z.boolean()`,
  `createdBy: UuidSchema.nullable()`, `createdAt: IsoDateTimeSchema`.
- `SkillPublishInputSchema` (`z.strictObject`): `slug`, `capabilityId`,
  `inputSchema`, `outputSchema`, `permissions`, `createdBy` — the registry
  computes `version` and sets `active: false` itself; callers never supply
  either.
- `SkillRegistryPort` interface:
  - `publish(input: SkillPublishInput): Promise<SkillDefinition>`
  - `activate(slug: SkillSlug, version: number): Promise<SkillDefinition>`
  - `get(slug: SkillSlug, version: number): Promise<SkillDefinition | undefined>`
  - `list(slug: SkillSlug): Promise<readonly SkillDefinition[]>`
  - `resolveActive(slug: SkillSlug): Promise<SkillDefinition | undefined>`

Export everything from `packages/contracts/src/index.ts` alongside the
existing `ports/mcp.js` export.

Error types (`SkillNotFoundError`, `SkillVersionConflictError`) live with the
implementation, not in contracts — matching `McpProviderNotAllowedError` in
`first-party-mcp-registry.ts` rather than in `ports/mcp.ts`.

## Database (`apps/backend/src/modules/skills/infrastructure/database`)

New migration `0021_skills.sql` (next free number after `0020`). The table is
a global, code-reviewed catalogue — not tenant data — so it follows the
`prompts`/`model_configs` pattern (no RLS) rather than the tenant-isolated
`policies`/`integration_connections` pattern:

```sql
CREATE TABLE skills (
  id uuid PRIMARY KEY,
  slug text NOT NULL,
  version integer NOT NULL,
  capability_id text NOT NULL,
  input_schema jsonb NOT NULL,
  output_schema jsonb NOT NULL,
  permissions text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT skills_version_check CHECK (version > 0)
);

CREATE UNIQUE INDEX skills_slug_version_uidx ON skills (slug, version);
CREATE UNIQUE INDEX skills_slug_active_uidx ON skills (slug) WHERE active;

CREATE FUNCTION protect_skill_version()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id OR
     OLD.slug IS DISTINCT FROM NEW.slug OR
     OLD.version IS DISTINCT FROM NEW.version OR
     OLD.capability_id IS DISTINCT FROM NEW.capability_id OR
     OLD.input_schema IS DISTINCT FROM NEW.input_schema OR
     OLD.output_schema IS DISTINCT FROM NEW.output_schema OR
     OLD.permissions IS DISTINCT FROM NEW.permissions OR
     OLD.created_by IS DISTINCT FROM NEW.created_by OR
     OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'skill versions are immutable';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER skills_immutable_version
  BEFORE UPDATE ON skills
  FOR EACH ROW EXECUTE FUNCTION protect_skill_version();

CREATE FUNCTION reject_skill_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'skill versions cannot be deleted';
END
$$;
CREATE TRIGGER skills_no_delete
  BEFORE DELETE ON skills
  FOR EACH ROW EXECUTE FUNCTION reject_skill_delete();

GRANT SELECT, INSERT, UPDATE ON skills TO app_rw;
```

Immutability follows the exact pattern already used for `prompts`
(`protect_prompt_version`/`reject_prompt_delete` in
`apps/backend/src/modules/policy/infrastructure/database/migrations/0007_policy.sql`):
a `BEFORE UPDATE` trigger raises unless every column except `active` is
unchanged, and a `BEFORE DELETE` trigger always raises. `app_rw` gets an
ordinary `GRANT SELECT, INSERT, UPDATE` (no column-level grant, no `DELETE`)
because the trigger — not the grant — is what makes a published version
immutable. Unlike `prompts` (where `app_rw` has no write access at all and an
external CI process inserts rows), `app_rw` here does insert and activate
rows, because `SkillRegistryPort.publish`/`activate` run as part of the
application in this ticket's scope.

Drizzle schema (`infrastructure/database/schema.ts`) mirrors this table
definition, following the `policies`/`prompts` schema file's structure
(`check`, `uniqueIndex`, no `pgPolicy`).

## Registry (`apps/backend/src/modules/skills/infrastructure/database`)

`PostgresSkillRegistry implements SkillRegistryPort`:

- `publish` — inside a transaction, computes `version = max(version WHERE
  slug = input.slug) + 1` (or `1` if none exists), inserts the row with
  `active: false`, returns the parsed `SkillDefinition`.
- `activate(slug, version)` — inside a transaction, clears `active` on the
  slug's current active row (if any) and sets it on the target row; throws
  `SkillNotFoundError` if `(slug, version)` doesn't exist. The partial unique
  index (`skills_slug_active_uidx`) is the backstop against a race leaving two
  active rows.
- `get`/`list`/`resolveActive` — plain `SELECT`s; `list` orders by `version`
  ascending; each returned row is parsed through `SkillDefinitionSchema`.

No in-memory registry is introduced — unlike `FirstPartyMcpRegistry`, skills
are DB-backed from this ticket onward per the approved design.

## Testing

- `packages/contracts/src/__tests__/skill.spec.ts` — schema boundary tests
  (mirrors `mcp.spec.ts`): valid/invalid slug and permission-scope shapes,
  `strictObject` rejects unknown keys, `SkillPublishInputSchema` rejects a
  caller-supplied `version` or `active`.
- `apps/backend/src/modules/skills/infrastructure/database/__tests__/postgres-skill-registry.spec.ts`
  — a fake `TenantTransaction` that compiles each `sql` template through
  Drizzle's `PgDialect` and asserts on the resulting SQL text and params
  (pattern: `postgres-agent-store.spec.ts`, not a real database connection):
  `publish` assigns version 1 then 2 for the same slug; `activate` issues a
  deactivate-then-activate pair inside one transaction; activating a
  nonexistent `(slug, version)` throws `SkillNotFoundError`; `resolveActive`
  returns `undefined` when no version is active; `list` returns all versions
  ordered.
- `apps/backend/src/modules/skills/infrastructure/database/__tests__/migration.spec.ts`
  — static assertions on the migration SQL (pattern: policy module's
  `migration.spec.ts`): table/index names, the `skills_immutable_version` and
  `skills_no_delete` triggers, absence of `ENABLE ROW LEVEL SECURITY`.

## Out of scope (later tickets)

- Skill execution (`execute()` delegating to `McpPort.invoke`) — C2b.
- Who is authorized to call `publish`/`activate` (an HTTP endpoint, an admin
  role, a CI gate) — this ticket only implements the port; no route is added.
- Runtime validation of an invocation payload against `inputSchema`/
  `outputSchema`.
- Composable agent profiles referencing active skills (design doc, slice 2).
- Marketplace `skill` item kind and public catalogue pages (design doc,
  slice 3).
