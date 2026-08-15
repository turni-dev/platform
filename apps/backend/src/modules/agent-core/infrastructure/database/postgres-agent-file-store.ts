import { sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  withTenant,
  type TenantDatabase,
  type TenantTransaction
} from '../../../../platform/database/with-tenant.js';
import {
  AgentFileRevisionSchema,
  type AgentFileIndexEntry,
  type AgentFileRecord,
  type AgentFileRevision,
  type AgentFileStorePort
} from '../../application/agent-file-store.port.js';

const LookupSchema = z.strictObject({
  tenantId: z.uuidv7(),
  agentId: z.uuidv7(),
  path: z.string().min(1).max(200)
});
const IndexLookupSchema = LookupSchema.omit({ path: true });

const FileIdRowsSchema = z.array(z.object({ id: z.uuidv7() }));
const IndexRowsSchema = z.array(
  z.object({ path: z.string(), current_rev: z.coerce.number().int().positive() })
);
const FileRowsSchema = z.array(
  z.object({
    path: z.string(),
    current_rev: z.coerce.number().int().positive(),
    content: z.string()
  })
);

/**
 * The owner-editable markdown of `memory_files`. A save is one transaction:
 * the file row is claimed or advanced, then the immutable revision is written
 * against the id that row actually has. Content is never logged.
 */
export class PostgresAgentFileStore implements AgentFileStorePort {
  public constructor(private readonly database: TenantDatabase) {}

  public async list(
    input: Readonly<{ tenantId: string; agentId: string }>
  ): Promise<readonly AgentFileIndexEntry[]> {
    const lookup = IndexLookupSchema.parse(input);

    return this.inTenant(lookup.tenantId, async (transaction) =>
      IndexRowsSchema.parse(
        await transaction.execute(sql`
          SELECT path, current_rev
          FROM memory_files
          WHERE tenant_id = ${lookup.tenantId}
            AND agent_id = ${lookup.agentId}
            AND deleted_at IS NULL
          ORDER BY path
        `)
      ).map((row) => ({ path: row.path, revision: row.current_rev }))
    );
  }

  public async read(
    input: Readonly<{ tenantId: string; agentId: string; path: string }>
  ): Promise<AgentFileRecord | undefined> {
    const lookup = LookupSchema.parse(input);

    return this.inTenant(lookup.tenantId, async (transaction) => {
      const rows = FileRowsSchema.parse(
        await transaction.execute(sql`
          SELECT f.path, f.current_rev, r.content
          FROM memory_files f
          JOIN memory_revisions r
            ON r.file_id = f.id AND r.rev = f.current_rev
          WHERE f.tenant_id = ${lookup.tenantId}
            AND f.agent_id = ${lookup.agentId}
            AND f.path = ${lookup.path}
            AND f.deleted_at IS NULL
          LIMIT 1
        `)
      );
      const row = rows[0];

      return row === undefined
        ? undefined
        : { path: row.path, revision: row.current_rev, content: row.content };
    });
  }

  public async saveRevision(input: AgentFileRevision): Promise<void> {
    const revision = AgentFileRevisionSchema.parse(input);

    await withTenant(this.database, revision.tenantId, async (transaction) => {
      const claimed = FileIdRowsSchema.parse(
        await transaction.execute(sql`
          INSERT INTO memory_files (id, tenant_id, agent_id, path, current_rev)
          VALUES (
            ${revision.fileId}, ${revision.tenantId}, ${revision.agentId},
            ${revision.path}, ${revision.revision}
          )
          ON CONFLICT (agent_id, path) WHERE deleted_at IS NULL
          DO UPDATE SET current_rev = EXCLUDED.current_rev
          RETURNING id
        `)
      );
      const fileId = claimed[0]?.id;
      if (fileId === undefined) {
        throw new Error('Memory file row was neither inserted nor updated');
      }

      await transaction.execute(sql`
        INSERT INTO memory_revisions (id, tenant_id, file_id, rev, content, author, created_by)
        VALUES (
          ${revision.revisionId}, ${revision.tenantId}, ${fileId}, ${revision.revision},
          ${revision.content}, ${'owner'}, ${revision.authorUserId}
        )
        RETURNING id
      `);
    });
  }

  public async remove(
    input: Readonly<{ tenantId: string; agentId: string; path: string }>
  ): Promise<boolean> {
    const lookup = LookupSchema.parse(input);

    return this.inTenant(
      lookup.tenantId,
      async (transaction) =>
        FileIdRowsSchema.parse(
          await transaction.execute(sql`
            UPDATE memory_files
            SET deleted_at = now()
            WHERE tenant_id = ${lookup.tenantId}
              AND agent_id = ${lookup.agentId}
              AND path = ${lookup.path}
              AND deleted_at IS NULL
            RETURNING id
          `)
        ).length === 1
    );
  }

  private inTenant<T>(
    tenantId: string,
    operation: (transaction: TenantTransaction) => Promise<T>
  ): Promise<T> {
    return withTenant(this.database, tenantId, operation);
  }
}
