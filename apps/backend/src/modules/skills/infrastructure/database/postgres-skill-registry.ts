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
