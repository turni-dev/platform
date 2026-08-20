# Skills Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `Skill` contract and a Postgres-backed `SkillRegistryPort` that stores immutable, versioned skill definitions (a slug-scoped wrapper around one `McpCapabilityId`) and lets a caller publish a new version, activate a version, and read versions back.

**Architecture:** `packages/contracts/src/ports/skill.ts` defines the Zod schemas and the `SkillRegistryPort` interface — the only type source, shared with any future consumer. `apps/backend/src/modules/skills` implements `PostgresSkillRegistry` against a new global (non-tenant, no RLS) `skills` table, following the `prompts` table's immutability pattern (`key`/`slug` + `version`, one `active` row per slug, `BEFORE UPDATE`/`BEFORE DELETE` triggers). No execution path, HTTP route, or write-authorization policy is added — this plan implements definition and registry only.

**Tech Stack:** TypeScript strict mode, Zod 4, Drizzle/Postgres, Vitest.

**Spec:** [`docs/superpowers/specs/2026-08-20-skills-core-design.md`](../specs/2026-08-20-skills-core-design.md)

## Global Constraints

- Strict TS: no `any`, no floating promises, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. Validate every DB row and every public input with Zod; `packages/contracts` is the only type source for `Skill`/`SkillRegistryPort` shapes.
- IDs are UUIDv7.
- A backend module never imports another module's infrastructure.
- New tests live in a sibling `__tests__/` directory; never colocate `*.spec.ts` with production code.
- The `skills` table is a global, code-reviewed catalogue, not tenant data: no RLS, no `tenant_id` column.
- A skill wraps exactly one `McpCapabilityId` and carries no executable logic of its own. Invocation (`execute()` delegating to `McpPort.invoke`), write-access policy, and HTTP routes are explicitly out of scope for this plan (later tickets).

---

### Task 1: Define the skill contracts

**Files:**
- Create: `packages/contracts/src/ports/skill.ts`
- Create: `packages/contracts/src/__tests__/skill.spec.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- Produces: `SkillSlugSchema`, `SkillPermissionScopeSchema`, `JsonSchemaObjectSchema`, `SkillDefinitionSchema` (and `type SkillDefinition`), `SkillPublishInputSchema` (and `type SkillPublishInput`), `type SkillSlug`, `SkillRegistryPort` — every later task imports these from `@turni/contracts`.

- [ ] **Step 1: Write the failing contract tests**

```ts
// packages/contracts/src/__tests__/skill.spec.ts
import { describe, expect, it } from 'vitest';
import { SkillDefinitionSchema, SkillPublishInputSchema } from '../index.js';

describe('skill contracts', () => {
  it('accepts a published, active skill definition', () => {
    expect(
      SkillDefinitionSchema.parse({
        id: '018f2d15-7b34-7a20-8f49-b2f1a430e4d1',
        slug: 'calendar-write-event',
        version: 1,
        capabilityId: 'google.calendar.events.create',
        inputSchema: { type: 'object', properties: {} },
        outputSchema: { type: 'object', properties: {} },
        permissions: ['calendar.events.write'],
        active: true,
        createdBy: '018f2d15-7b34-7a20-8f49-b2f1a430e4d2',
        createdAt: '2026-08-20T10:00:00Z'
      })
    ).toMatchObject({ slug: 'calendar-write-event', version: 1, active: true });
  });

  it('rejects an invalid permission scope', () => {
    expect(() =>
      SkillDefinitionSchema.parse({
        id: '018f2d15-7b34-7a20-8f49-b2f1a430e4d1',
        slug: 'calendar-write-event',
        version: 1,
        capabilityId: 'google.calendar.events.create',
        inputSchema: {},
        outputSchema: {},
        permissions: ['not a scope'],
        active: false,
        createdBy: null,
        createdAt: '2026-08-20T10:00:00Z'
      })
    ).toThrow();
  });

  it('rejects a publish input that tries to set version or active', () => {
    expect(() =>
      SkillPublishInputSchema.parse({
        slug: 'calendar-write-event',
        capabilityId: 'google.calendar.events.create',
        inputSchema: {},
        outputSchema: {},
        permissions: [],
        createdBy: null,
        version: 1
      })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the test and observe its import failure**

Run: `npx vitest run --config vitest.config.ts packages/contracts/src/__tests__/skill.spec.ts`
Expected: FAIL — `SkillDefinitionSchema`/`SkillPublishInputSchema` are not exported.

- [ ] **Step 3: Add `ports/skill.ts`**

```ts
import { z } from 'zod';
import { IsoDateTimeSchema, UuidSchema } from '../common.js';
import { McpCapabilityIdSchema } from './mcp.js';

export const SkillSlugSchema = z.string().regex(/^[a-z][a-z0-9-]*$/);
export type SkillSlug = z.infer<typeof SkillSlugSchema>;

export const SkillPermissionScopeSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/);
export type SkillPermissionScope = z.infer<typeof SkillPermissionScopeSchema>;

/** Validates "is a JSON object"; JSON Schema semantics are not checked here. */
export const JsonSchemaObjectSchema = z.record(z.string(), z.json());
export type JsonSchemaObject = z.infer<typeof JsonSchemaObjectSchema>;

export const SkillDefinitionSchema = z.strictObject({
  id: UuidSchema,
  slug: SkillSlugSchema,
  version: z.number().int().positive(),
  capabilityId: McpCapabilityIdSchema,
  inputSchema: JsonSchemaObjectSchema,
  outputSchema: JsonSchemaObjectSchema,
  permissions: z.array(SkillPermissionScopeSchema).max(20),
  active: z.boolean(),
  createdBy: UuidSchema.nullable(),
  createdAt: IsoDateTimeSchema
});
export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>;

/** The registry assigns `version` (next for the slug) and `active` (always
 * `false` for a new publish); callers never set either. */
export const SkillPublishInputSchema = z.strictObject({
  slug: SkillSlugSchema,
  capabilityId: McpCapabilityIdSchema,
  inputSchema: JsonSchemaObjectSchema,
  outputSchema: JsonSchemaObjectSchema,
  permissions: z.array(SkillPermissionScopeSchema).max(20),
  createdBy: UuidSchema.nullable()
});
export type SkillPublishInput = z.infer<typeof SkillPublishInputSchema>;

/** Definition and registry only: no `execute`. Invocation delegates to
 * `McpPort.invoke` in a later ticket. */
export interface SkillRegistryPort {
  publish(input: SkillPublishInput): Promise<SkillDefinition>;
  activate(slug: SkillSlug, version: number): Promise<SkillDefinition>;
  get(slug: SkillSlug, version: number): Promise<SkillDefinition | undefined>;
  list(slug: SkillSlug): Promise<readonly SkillDefinition[]>;
  resolveActive(slug: SkillSlug): Promise<SkillDefinition | undefined>;
}
```

- [ ] **Step 4: Export it from the package index**

```ts
// packages/contracts/src/index.ts — append after the mcp export
export * from './ports/skill.js';
```

- [ ] **Step 5: Run the contract test and strict typecheck**

Run: `npx vitest run --config vitest.config.ts packages/contracts/src/__tests__/skill.spec.ts && npx tsc -p packages/contracts/tsconfig.lib.json --noEmit`
Expected: PASS, both green.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): add skill definition and registry port"
```

### Task 2: Add the `skills` table migration and Drizzle schema

**Files:**
- Create: `apps/backend/src/modules/skills/infrastructure/database/migrations/0021_skills.sql`
- Create: `apps/backend/src/modules/skills/infrastructure/database/schema.ts`
- Create: `apps/backend/src/modules/skills/infrastructure/database/__tests__/schema.spec.ts`
- Create: `apps/backend/src/modules/skills/infrastructure/database/__tests__/migration.spec.ts`

**Interfaces:**
- Consumes: nothing from Task 1 (this task is pure SQL/Drizzle).
- Produces: the `skills` table (columns: `id`, `slug`, `version`, `capability_id`, `input_schema`, `output_schema`, `permissions`, `active`, `created_by`, `created_at`); Drizzle table `skills` exported from `schema.ts`, used by Task 3.

- [ ] **Step 1: Write the failing migration tests**

```ts
// apps/backend/src/modules/skills/infrastructure/database/__tests__/migration.spec.ts
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../migrations/0021_skills.sql', import.meta.url);

describe('skills migration', () => {
  it('creates the skills table with no tenant scoping', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain('CREATE TABLE skills');
    expect(migration).not.toContain('tenant_id');
    expect(migration).not.toContain('ENABLE ROW LEVEL SECURITY');
  });

  it('allows one active immutable version per slug', () => {
    return readFile(migrationUrl, 'utf8').then((migration) => {
      expect(migration).toContain(
        'CREATE UNIQUE INDEX skills_slug_version_uidx ON skills (slug, version)'
      );
      expect(migration).toContain(
        "CREATE UNIQUE INDEX skills_slug_active_uidx ON skills (slug) WHERE active"
      );
    });
  });

  it('protects published versions with triggers, not just grants', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain('CREATE TRIGGER skills_immutable_version');
    expect(migration).toContain('CREATE TRIGGER skills_no_delete');
    expect(migration).toContain("RAISE EXCEPTION 'skill versions are immutable'");
    expect(migration).toContain("RAISE EXCEPTION 'skill versions cannot be deleted'");
    expect(migration).toContain('GRANT SELECT, INSERT, UPDATE ON skills TO app_rw');
    expect(migration).not.toContain('DELETE ON skills TO app_rw');
  });
});
```

- [ ] **Step 2: Run the tests and observe the missing-file failure**

Run: `npx vitest run --config vitest.config.ts apps/backend/src/modules/skills/infrastructure/database/__tests__/migration.spec.ts`
Expected: FAIL — `ENOENT` reading the migration file.

- [ ] **Step 3: Write `migrations/0021_skills.sql`**

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

- [ ] **Step 4: Run the migration tests**

Run: `npx vitest run --config vitest.config.ts apps/backend/src/modules/skills/infrastructure/database/__tests__/migration.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing schema test**

```ts
// apps/backend/src/modules/skills/infrastructure/database/__tests__/schema.spec.ts
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { skills } from '../schema.js';

describe('skills database schema', () => {
  it('is a global catalogue with no RLS', () => {
    expect(getTableConfig(skills).enableRLS).toBe(false);
    expect(getTableConfig(skills).name).toBe('skills');
  });

  it('allows one active version per slug', () => {
    const config = getTableConfig(skills);
    const versionIndex = config.indexes.find(
      (index) => index.config.name === 'skills_slug_version_uidx'
    );
    const activeIndex = config.indexes.find(
      (index) => index.config.name === 'skills_slug_active_uidx'
    );

    expect(versionIndex?.config.unique).toBe(true);
    expect(activeIndex?.config.unique).toBe(true);
    expect(activeIndex?.config.where).toBeDefined();
  });

  it('rejects a non-positive version at the database layer', () => {
    expect(getTableConfig(skills).checks.map((check) => check.name)).toEqual([
      'skills_version_check'
    ]);
  });
});
```

- [ ] **Step 6: Run it and observe the missing-module failure**

Run: `npx vitest run --config vitest.config.ts apps/backend/src/modules/skills/infrastructure/database/__tests__/schema.spec.ts`
Expected: FAIL — cannot resolve `../schema.js`.

- [ ] **Step 7: Write `schema.ts`**

```ts
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core';

export const skills = pgTable(
  'skills',
  {
    id: uuid('id').primaryKey(),
    slug: text('slug').notNull(),
    version: integer('version').notNull(),
    capabilityId: text('capability_id').notNull(),
    inputSchema: jsonb('input_schema').$type<Record<string, unknown>>().notNull(),
    outputSchema: jsonb('output_schema').$type<Record<string, unknown>>().notNull(),
    permissions: text('permissions').array().notNull().default([]),
    active: boolean('active').default(false).notNull(),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    check('skills_version_check', sql`${table.version} > 0`),
    uniqueIndex('skills_slug_version_uidx').on(table.slug, table.version),
    uniqueIndex('skills_slug_active_uidx')
      .on(table.slug)
      .where(sql`${table.active} = true`)
  ]
);

export const skillsTables = [skills] as const;
```

- [ ] **Step 8: Run the schema and migration tests together, then typecheck**

Run: `npx vitest run --config vitest.config.ts apps/backend/src/modules/skills/infrastructure/database/__tests__ && npx tsc -p apps/backend/tsconfig.app.json --noEmit`
Expected: all PASS, compiler exits 0.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/skills/infrastructure/database
git commit -m "feat(skills): add the immutable skills table"
```

### Task 3: Add a module-local UUIDv7 generator

**Files:**
- Create: `apps/backend/src/modules/skills/infrastructure/uuid-v7-generator.ts`
- Create: `apps/backend/src/modules/skills/infrastructure/__tests__/uuid-v7-generator.spec.ts`

**Interfaces:**
- Produces: `interface UuidV7GeneratorPort { next(): string }`, `class UuidV7Generator implements UuidV7GeneratorPort` — Task 4's `PostgresSkillRegistry` takes a `UuidV7GeneratorPort` in its constructor and calls `.next()` to assign a new skill's `id`.

- [ ] **Step 1: Write the failing generator test**

```ts
// apps/backend/src/modules/skills/infrastructure/__tests__/uuid-v7-generator.spec.ts
import { describe, expect, it } from 'vitest';
import { UuidV7Generator } from '../uuid-v7-generator.js';

describe('UuidV7Generator', () => {
  it('produces a version-7 UUID from a fixed clock and random source', () => {
    const generator = new UuidV7Generator({
      now: () => Date.UTC(2026, 7, 20, 10, 0, 0),
      randomBytes: () => new Uint8Array(10).fill(0xab)
    });

    const id = generator.next();

    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it('produces monotonically increasing ids across advancing timestamps', () => {
    let tick = Date.UTC(2026, 7, 20, 10, 0, 0);
    const generator = new UuidV7Generator({ now: () => tick });

    const first = generator.next();
    tick += 1;
    const second = generator.next();

    expect(first < second).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and observe the missing-module failure**

Run: `npx vitest run --config vitest.config.ts apps/backend/src/modules/skills/infrastructure/__tests__/uuid-v7-generator.spec.ts`
Expected: FAIL — cannot resolve `../uuid-v7-generator.js`.

- [ ] **Step 3: Write `uuid-v7-generator.ts`**

```ts
import { randomBytes } from 'node:crypto';

const UUID_BYTE_LENGTH = 16;
const RANDOM_BYTE_LENGTH = 10;

export interface UuidV7GeneratorPort {
  next(): string;
}

export interface UuidV7GeneratorOptions {
  now?: () => number;
  randomBytes?: (size: number) => Uint8Array;
}

export class UuidV7Generator implements UuidV7GeneratorPort {
  private readonly now: () => number;
  private readonly getRandomBytes: (size: number) => Uint8Array;

  public constructor(options: UuidV7GeneratorOptions = {}) {
    this.now = options.now ?? Date.now;
    this.getRandomBytes = options.randomBytes ?? randomBytes;
  }

  public next(): string {
    const timestamp = this.now();
    if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp >= 2 ** 48) {
      throw new Error('UUIDv7 timestamp must fit in 48 bits');
    }

    const random = this.getRandomBytes(RANDOM_BYTE_LENGTH);
    if (random.length !== RANDOM_BYTE_LENGTH) {
      throw new Error('UUIDv7 random source returned an invalid byte count');
    }

    const bytes = new Uint8Array(UUID_BYTE_LENGTH);
    for (let index = 5; index >= 0; index -= 1) {
      bytes[index] = Math.floor(timestamp / 2 ** (8 * (5 - index))) & 0xff;
    }

    bytes[6] = 0x70 | (random[0]! & 0x0f);
    bytes[7] = random[1]!;
    bytes[8] = 0x80 | (random[2]! & 0x3f);
    bytes.set(random.slice(3), 9);

    return formatUuid(bytes);
  }
}

function formatUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run --config vitest.config.ts apps/backend/src/modules/skills/infrastructure/__tests__/uuid-v7-generator.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/skills/infrastructure/uuid-v7-generator.ts apps/backend/src/modules/skills/infrastructure/__tests__/uuid-v7-generator.spec.ts
git commit -m "feat(skills): add a module-local UUIDv7 generator"
```

### Task 4: Implement `PostgresSkillRegistry`

**Files:**
- Create: `apps/backend/src/modules/skills/infrastructure/database/postgres-skill-registry.ts`
- Create: `apps/backend/src/modules/skills/infrastructure/database/__tests__/postgres-skill-registry.spec.ts`

**Interfaces:**
- Consumes: `SkillDefinitionSchema`, `SkillPublishInputSchema`, `type SkillDefinition`, `type SkillPublishInput`, `type SkillSlug`, `SkillRegistryPort` (Task 1, `@turni/contracts`); `TenantDatabase`, `TenantTransaction` (`apps/backend/src/platform/database/with-tenant.js`); `timestampColumn` (`apps/backend/src/platform/database/sql-timestamp.js`); `UuidV7GeneratorPort` (Task 3).
- Produces: `class PostgresSkillRegistry implements SkillRegistryPort`, `class SkillNotFoundError extends Error` — both exported for later tickets (execution, HTTP routes) to import.

- [ ] **Step 1: Write the failing registry test**

```ts
// apps/backend/src/modules/skills/infrastructure/database/__tests__/postgres-skill-registry.spec.ts
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import type {
  TenantDatabase,
  TenantTransaction
} from '../../../../../platform/database/with-tenant.js';
import { PostgresSkillRegistry, SkillNotFoundError } from '../postgres-skill-registry.js';

const skillId = '018f2d15-7b34-7a20-8f49-b2f1a430e4d1';
const createdBy = '018f2d15-7b34-7a20-8f49-b2f1a430e4d2';

type RecordedQuery = Readonly<{ sql: string; params: readonly unknown[] }>;

class FakeTransaction implements TenantTransaction {
  public readonly queries: RecordedQuery[] = [];
  public rowsFor: (sql: string) => readonly unknown[] = () => [];

  public execute(query: SQL): Promise<unknown> {
    const compiled = new PgDialect().sqlToQuery(query);
    this.queries.push({ sql: compiled.sql, params: compiled.params });

    return Promise.resolve(this.rowsFor(compiled.sql));
  }
}

class FakeDatabase implements TenantDatabase {
  public readonly transactionHandle = new FakeTransaction();

  public async transaction<T>(
    operation: (transaction: TenantTransaction) => Promise<T>
  ): Promise<T> {
    return operation(this.transactionHandle);
  }
}

const skillRow = {
  id: skillId,
  slug: 'calendar-write-event',
  version: 1,
  capability_id: 'google.calendar.events.create',
  input_schema: { type: 'object', properties: {} },
  output_schema: { type: 'object', properties: {} },
  permissions: ['calendar.events.write'],
  active: false,
  created_by: createdBy,
  created_at: new Date('2026-08-20T10:00:00Z')
};

describe('PostgresSkillRegistry', () => {
  it('assigns version 1 to the first published skill for a slug', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.rowsFor = (sql) => {
      if (sql.includes('MAX(version)')) {
        return [{ max_version: null }];
      }
      if (sql.includes('INSERT INTO skills')) {
        return [skillRow];
      }
      return [];
    };
    const registry = new PostgresSkillRegistry(database, { next: () => skillId });

    const skill = await registry.publish({
      slug: 'calendar-write-event',
      capabilityId: 'google.calendar.events.create',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: { type: 'object', properties: {} },
      permissions: ['calendar.events.write'],
      createdBy
    });

    expect(skill).toMatchObject({ slug: 'calendar-write-event', version: 1, active: false });
  });

  it('assigns the next version after an existing published version', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.rowsFor = (sql) => {
      if (sql.includes('MAX(version)')) {
        return [{ max_version: 1 }];
      }
      if (sql.includes('INSERT INTO skills')) {
        return [{ ...skillRow, version: 2 }];
      }
      return [];
    };
    const registry = new PostgresSkillRegistry(database, { next: () => skillId });

    const skill = await registry.publish({
      slug: 'calendar-write-event',
      capabilityId: 'google.calendar.events.create',
      inputSchema: {},
      outputSchema: {},
      permissions: [],
      createdBy: null
    });

    expect(skill.version).toBe(2);
    const insert = database.transactionHandle.queries.find((query) =>
      query.sql.includes('INSERT INTO skills')
    );
    expect(insert?.params).toContain(2);
  });

  it('activates a version and deactivates the previously active one in the same transaction', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.rowsFor = (sql) => {
      if (sql.includes('SET active = true')) {
        return [{ ...skillRow, version: 2, active: true }];
      }
      return [];
    };
    const registry = new PostgresSkillRegistry(database, { next: () => skillId });

    const skill = await registry.activate('calendar-write-event', 2);

    expect(skill.active).toBe(true);
    const statements = database.transactionHandle.queries.map((query) => query.sql);
    expect(statements[0]).toContain('SET active = false');
    expect(statements[1]).toContain('SET active = true');
  });

  it('throws SkillNotFoundError when activating a version that does not exist', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.rowsFor = () => [];
    const registry = new PostgresSkillRegistry(database, { next: () => skillId });

    await expect(registry.activate('calendar-write-event', 9)).rejects.toBeInstanceOf(
      SkillNotFoundError
    );
  });

  it('resolves undefined when no version of a slug is active', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.rowsFor = () => [];
    const registry = new PostgresSkillRegistry(database, { next: () => skillId });

    await expect(registry.resolveActive('calendar-write-event')).resolves.toBeUndefined();
  });

  it('lists every version of a slug in ascending order', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.rowsFor = () => [
      skillRow,
      { ...skillRow, version: 2, active: true }
    ];
    const registry = new PostgresSkillRegistry(database, { next: () => skillId });

    const versions = await registry.list('calendar-write-event');

    expect(versions.map((skill) => skill.version)).toEqual([1, 2]);
    expect(database.transactionHandle.queries[0]?.sql).toContain('ORDER BY version');
  });
});
```

- [ ] **Step 2: Run the tests and observe the missing-module failure**

Run: `npx vitest run --config vitest.config.ts apps/backend/src/modules/skills/infrastructure/database/__tests__/postgres-skill-registry.spec.ts`
Expected: FAIL — cannot resolve `../postgres-skill-registry.js`.

- [ ] **Step 3: Write `postgres-skill-registry.ts`**

```ts
import {
  SkillDefinitionSchema,
  SkillPublishInputSchema,
  type SkillDefinition,
  type SkillPublishInput,
  type SkillRegistryPort,
  type SkillSlug
} from '@turni/contracts';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { timestampColumn } from '../../../../platform/database/sql-timestamp.js';
import type { TenantDatabase, TenantTransaction } from '../../../../platform/database/with-tenant.js';
import type { UuidV7GeneratorPort } from '../uuid-v7-generator.js';

export class SkillNotFoundError extends Error {
  public constructor(slug: string, version: number) {
    super(`No skill ${slug}@${version} exists`);
    this.name = 'SkillNotFoundError';
  }
}

const jsonbColumn = z
  .union([z.string(), z.record(z.string(), z.unknown())])
  .transform((value) => (typeof value === 'string' ? (JSON.parse(value) as unknown) : value));

const SkillRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  version: z.number().int(),
  capability_id: z.string(),
  input_schema: jsonbColumn,
  output_schema: jsonbColumn,
  permissions: z.array(z.string()),
  active: z.boolean(),
  created_by: z.string().nullable(),
  created_at: timestampColumn
});

const MaxVersionRowSchema = z.array(z.object({ max_version: z.number().int().nullable() }));

function toSkillDefinition(row: z.output<typeof SkillRowSchema>): SkillDefinition {
  return SkillDefinitionSchema.parse({
    id: row.id,
    slug: row.slug,
    version: row.version,
    capabilityId: row.capability_id,
    inputSchema: row.input_schema,
    outputSchema: row.output_schema,
    permissions: row.permissions,
    active: row.active,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString()
  });
}

const columns = sql`
  id, slug, version, capability_id, input_schema, output_schema,
  permissions, active, created_by, created_at
`;

export class PostgresSkillRegistry implements SkillRegistryPort {
  public constructor(
    private readonly database: TenantDatabase,
    private readonly ids: UuidV7GeneratorPort
  ) {}

  public async publish(input: SkillPublishInput): Promise<SkillDefinition> {
    const request = SkillPublishInputSchema.parse(input);

    return this.database.transaction(async (transaction) => {
      const maxVersionRows = MaxVersionRowSchema.parse(
        await transaction.execute(sql`
          SELECT MAX(version) AS max_version FROM skills WHERE slug = ${request.slug}
        `)
      );
      const nextVersion = (maxVersionRows[0]?.max_version ?? 0) + 1;
      const id = this.ids.next();

      const rows = z.array(SkillRowSchema).parse(
        await transaction.execute(sql`
          INSERT INTO skills (
            id, slug, version, capability_id, input_schema, output_schema,
            permissions, active, created_by
          ) VALUES (
            ${id}, ${request.slug}, ${nextVersion}, ${request.capabilityId},
            ${JSON.stringify(request.inputSchema)}::jsonb,
            ${JSON.stringify(request.outputSchema)}::jsonb,
            ${request.permissions}, false, ${request.createdBy}
          )
          RETURNING ${columns}
        `)
      );

      return toSkillDefinition(rows[0]!);
    });
  }

  public async activate(slug: SkillSlug, version: number): Promise<SkillDefinition> {
    return this.database.transaction(async (transaction) => {
      await transaction.execute(sql`
        UPDATE skills SET active = false WHERE slug = ${slug} AND active = true
      `);
      const rows = z.array(SkillRowSchema).parse(
        await transaction.execute(sql`
          UPDATE skills SET active = true
          WHERE slug = ${slug} AND version = ${version}
          RETURNING ${columns}
        `)
      );
      const row = rows[0];

      if (row === undefined) {
        throw new SkillNotFoundError(slug, version);
      }

      return toSkillDefinition(row);
    });
  }

  public async get(slug: SkillSlug, version: number): Promise<SkillDefinition | undefined> {
    return this.database.transaction(async (transaction) => {
      const rows = z.array(SkillRowSchema).parse(
        await transaction.execute(sql`
          SELECT ${columns} FROM skills WHERE slug = ${slug} AND version = ${version}
        `)
      );

      return rows[0] === undefined ? undefined : toSkillDefinition(rows[0]);
    });
  }

  public async list(slug: SkillSlug): Promise<readonly SkillDefinition[]> {
    return this.database.transaction(async (transaction) => {
      const rows = z.array(SkillRowSchema).parse(
        await transaction.execute(sql`
          SELECT ${columns} FROM skills WHERE slug = ${slug} ORDER BY version ASC
        `)
      );

      return rows.map(toSkillDefinition);
    });
  }

  public async resolveActive(slug: SkillSlug): Promise<SkillDefinition | undefined> {
    return this.database.transaction(async (transaction) => {
      const rows = z.array(SkillRowSchema).parse(
        await transaction.execute(sql`
          SELECT ${columns} FROM skills WHERE slug = ${slug} AND active = true LIMIT 1
        `)
      );

      return rows[0] === undefined ? undefined : toSkillDefinition(rows[0]);
    });
  }
}
```

- [ ] **Step 4: Run the registry tests**

Run: `npx vitest run --config vitest.config.ts apps/backend/src/modules/skills/infrastructure/database/__tests__/postgres-skill-registry.spec.ts`
Expected: PASS.

- [ ] **Step 5: Run strict typecheck**

Run: `npx tsc -p apps/backend/tsconfig.app.json --noEmit`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/skills/infrastructure/database/postgres-skill-registry.ts apps/backend/src/modules/skills/infrastructure/database/__tests__/postgres-skill-registry.spec.ts
git commit -m "feat(skills): implement the Postgres skill registry"
```

### Task 5: Verify the whole module together

**Files:**
- None (verification only).

- [ ] **Step 1: Run every skills and contracts test with coverage**

Run: `npx vitest run --config vitest.config.ts apps/backend/src/modules/skills packages/contracts/src/__tests__/skill.spec.ts`
Expected: every suite passes.

- [ ] **Step 2: Typecheck both touched packages**

Run: `npx tsc -p packages/contracts/tsconfig.lib.json --noEmit && npx tsc -p apps/backend/tsconfig.app.json --noEmit`
Expected: both exit 0.

- [ ] **Step 3: Lint the new module**

Run: `npx nx run-many -t lint -p contracts,backend`
Expected: no lint errors in the files this plan touched.

- [ ] **Step 4: Confirm no accidental scope creep**

Run: `git diff --stat main`
Expected: only `packages/contracts/src/ports/skill.ts`, `packages/contracts/src/__tests__/skill.spec.ts`, `packages/contracts/src/index.ts`, and files under `apps/backend/src/modules/skills/` appear — no HTTP route, no other module touched.

- [ ] **Step 5: Commit if Step 3 or 4 needed a fix**

```bash
git add -u
git commit -m "chore(skills): fix lint findings"
```
