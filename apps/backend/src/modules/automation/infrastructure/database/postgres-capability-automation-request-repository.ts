import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { withTenant, type TenantDatabase } from '../../../../platform/database/with-tenant.js';
import type {
  CapabilityAutomationRequest,
  CapabilityAutomationStatus
} from '../../domain/capability-automation-request.js';
import type { CapabilityAutomationRequestRepositoryPort } from '../../application/capability-automation-request-repository.port.js';

const StatusSchema = z.enum([
  'pending_approval',
  'approved',
  'rejected',
  'executing',
  'executed',
  'failed'
]);

const RowSchema = z.object({
  id: z.uuidv7(),
  tenant_id: z.uuidv7(),
  agent_id: z.uuidv7(),
  connection_id: z.uuidv7(),
  channel: z.literal('vk'),
  guest_ref: z.string(),
  idempotency_key: z.string(),
  status: StatusSchema,
  calendar_summary: z.string(),
  calendar_starts_at: z.coerce.date(),
  calendar_ends_at: z.coerce.date(),
  calendar_event_id: z.string().nullable(),
  sheets_appended: z.boolean(),
  decided_by: z.string().nullable(),
  decided_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

function toDomain(row: z.output<typeof RowSchema>): CapabilityAutomationRequest {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    agentId: row.agent_id,
    connectionId: row.connection_id,
    channel: row.channel,
    guestRef: row.guest_ref,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    calendarInput: {
      summary: row.calendar_summary,
      startsAt: row.calendar_starts_at.toISOString(),
      endsAt: row.calendar_ends_at.toISOString()
    },
    calendarEventId: row.calendar_event_id ?? undefined,
    sheetsAppended: row.sheets_appended,
    decidedBy: row.decided_by ?? undefined,
    decidedAt: row.decided_at?.toISOString() ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

const SELECT_COLUMNS = sql`
  id, tenant_id, agent_id, connection_id, channel, guest_ref, idempotency_key,
  status, calendar_summary, calendar_starts_at, calendar_ends_at,
  calendar_event_id, sheets_appended, decided_by, decided_at, created_at, updated_at
`;

export class PostgresCapabilityAutomationRequestRepository
  implements CapabilityAutomationRequestRepositoryPort
{
  public constructor(private readonly database: TenantDatabase) {}

  public async findById(
    tenantId: string,
    id: string
  ): Promise<CapabilityAutomationRequest | undefined> {
    const tenant = z.uuidv7().parse(tenantId);
    const requestId = z.uuidv7().parse(id);

    return withTenant(this.database, tenant, async (transaction) => {
      const rows = z.array(RowSchema).parse(
        await transaction.execute(sql`
          SELECT ${SELECT_COLUMNS} FROM capability_automation_requests
          WHERE tenant_id = ${tenant} AND id = ${requestId}
        `)
      );
      return rows[0] === undefined ? undefined : toDomain(rows[0]);
    });
  }

  public async findByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string
  ): Promise<CapabilityAutomationRequest | undefined> {
    const tenant = z.uuidv7().parse(tenantId);

    return withTenant(this.database, tenant, async (transaction) => {
      const rows = z.array(RowSchema).parse(
        await transaction.execute(sql`
          SELECT ${SELECT_COLUMNS} FROM capability_automation_requests
          WHERE tenant_id = ${tenant} AND idempotency_key = ${idempotencyKey}
        `)
      );
      return rows[0] === undefined ? undefined : toDomain(rows[0]);
    });
  }

  public async listPending(tenantId: string): Promise<readonly CapabilityAutomationRequest[]> {
    const tenant = z.uuidv7().parse(tenantId);

    return withTenant(this.database, tenant, async (transaction) => {
      const rows = z.array(RowSchema).parse(
        await transaction.execute(sql`
          SELECT ${SELECT_COLUMNS} FROM capability_automation_requests
          WHERE tenant_id = ${tenant} AND status = 'pending_approval'
          ORDER BY created_at ASC
        `)
      );
      return rows.map(toDomain);
    });
  }

  public async create(
    request: CapabilityAutomationRequest
  ): Promise<Readonly<{ request: CapabilityAutomationRequest; created: boolean }>> {
    const tenant = z.uuidv7().parse(request.tenantId);

    return withTenant(this.database, tenant, async (transaction) => {
      const inserted = z.array(RowSchema).parse(
        await transaction.execute(sql`
          INSERT INTO capability_automation_requests (
            id, tenant_id, agent_id, connection_id, channel, guest_ref,
            idempotency_key, status, calendar_summary, calendar_starts_at, calendar_ends_at
          ) VALUES (
            ${request.id}, ${tenant}, ${request.agentId}, ${request.connectionId},
            ${request.channel}, ${request.guestRef}, ${request.idempotencyKey}, ${request.status},
            ${request.calendarInput.summary}, ${request.calendarInput.startsAt},
            ${request.calendarInput.endsAt}
          )
          ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
          RETURNING ${SELECT_COLUMNS}
        `)
      );

      if (inserted[0] !== undefined) {
        return { request: toDomain(inserted[0]), created: true };
      }

      const existing = z.array(RowSchema).parse(
        await transaction.execute(sql`
          SELECT ${SELECT_COLUMNS} FROM capability_automation_requests
          WHERE tenant_id = ${tenant} AND idempotency_key = ${request.idempotencyKey}
        `)
      );
      const row = existing[0];
      if (row === undefined) {
        throw new Error('Insert conflicted but the existing row could not be found');
      }
      return { request: toDomain(row), created: false };
    });
  }

  public approve(
    tenantId: string,
    id: string,
    decidedBy: string,
    decidedAt: string
  ): Promise<CapabilityAutomationRequest | undefined> {
    return this.transition(tenantId, id, ['pending_approval'], sql`
      status = 'approved', decided_by = ${decidedBy}, decided_at = ${decidedAt},
      updated_at = now()
    `);
  }

  public reject(
    tenantId: string,
    id: string,
    decidedBy: string,
    decidedAt: string
  ): Promise<CapabilityAutomationRequest | undefined> {
    return this.transition(tenantId, id, ['pending_approval'], sql`
      status = 'rejected', decided_by = ${decidedBy}, decided_at = ${decidedAt},
      updated_at = now()
    `);
  }

  public claimForExecution(
    tenantId: string,
    id: string
  ): Promise<CapabilityAutomationRequest | undefined> {
    return this.transition(tenantId, id, ['approved', 'failed'], sql`
      status = 'executing', updated_at = now()
    `);
  }

  public async markCalendarCreated(
    tenantId: string,
    id: string,
    calendarEventId: string
  ): Promise<void> {
    const tenant = z.uuidv7().parse(tenantId);
    const requestId = z.uuidv7().parse(id);

    await withTenant(this.database, tenant, (transaction) =>
      transaction.execute(sql`
        UPDATE capability_automation_requests
        SET calendar_event_id = ${calendarEventId}, updated_at = now()
        WHERE tenant_id = ${tenant} AND id = ${requestId}
      `)
    );
  }

  public async markSheetsAppended(tenantId: string, id: string): Promise<void> {
    const tenant = z.uuidv7().parse(tenantId);
    const requestId = z.uuidv7().parse(id);

    await withTenant(this.database, tenant, (transaction) =>
      transaction.execute(sql`
        UPDATE capability_automation_requests
        SET sheets_appended = true, updated_at = now()
        WHERE tenant_id = ${tenant} AND id = ${requestId}
      `)
    );
  }

  public async markExecuted(tenantId: string, id: string): Promise<CapabilityAutomationRequest> {
    return this.forceStatus(tenantId, id, 'executed');
  }

  public async markFailed(tenantId: string, id: string): Promise<CapabilityAutomationRequest> {
    return this.forceStatus(tenantId, id, 'failed');
  }

  private async forceStatus(
    tenantId: string,
    id: string,
    status: CapabilityAutomationStatus
  ): Promise<CapabilityAutomationRequest> {
    const tenant = z.uuidv7().parse(tenantId);
    const requestId = z.uuidv7().parse(id);

    return withTenant(this.database, tenant, async (transaction) => {
      const rows = z.array(RowSchema).parse(
        await transaction.execute(sql`
          UPDATE capability_automation_requests
          SET status = ${status}, updated_at = now()
          WHERE tenant_id = ${tenant} AND id = ${requestId}
          RETURNING ${SELECT_COLUMNS}
        `)
      );
      const row = rows[0];
      if (row === undefined) {
        throw new Error(`No capability automation request ${id} exists for this tenant`);
      }
      return toDomain(row);
    });
  }

  private async transition(
    tenantId: string,
    id: string,
    expectedStatuses: readonly CapabilityAutomationStatus[],
    setClause: ReturnType<typeof sql>
  ): Promise<CapabilityAutomationRequest | undefined> {
    const tenant = z.uuidv7().parse(tenantId);
    const requestId = z.uuidv7().parse(id);
    const statuses = sql.join(
      expectedStatuses.map((status) => sql`${status}`),
      sql`, `
    );

    return withTenant(this.database, tenant, async (transaction) => {
      const rows = z.array(RowSchema).parse(
        await transaction.execute(sql`
          UPDATE capability_automation_requests
          SET ${setClause}
          WHERE tenant_id = ${tenant} AND id = ${requestId} AND status IN (${statuses})
          RETURNING ${SELECT_COLUMNS}
        `)
      );
      return rows[0] === undefined ? undefined : toDomain(rows[0]);
    });
  }
}
