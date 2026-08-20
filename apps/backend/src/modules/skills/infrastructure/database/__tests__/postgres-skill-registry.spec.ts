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
