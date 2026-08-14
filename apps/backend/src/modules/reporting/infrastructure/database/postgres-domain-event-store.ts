import { DomainEventEnvelopeSchema, type DomainEventEnvelope } from '@turni/contracts';
import { sql } from 'drizzle-orm';
import { timestampParam } from '../../../../platform/database/sql-timestamp.js';
import { withTenant, type TenantDatabase } from '../../../../platform/database/with-tenant.js';
import type { DomainEventPersistencePort } from '../database-domain-event-bus.js';

/**
 * Appends analytics events to the partitioned `events` table. The table is
 * tenant isolated and append-only for `app_rw`, so every write enters the
 * tenant context of the event it carries.
 */
export class PostgresDomainEventStore implements DomainEventPersistencePort {
  public constructor(private readonly database: TenantDatabase) {}

  public async append(event: DomainEventEnvelope): Promise<void> {
    const parsed = DomainEventEnvelopeSchema.parse(event);

    await withTenant(this.database, parsed.tenantId, (transaction) =>
      transaction
        .execute(sql`
          INSERT INTO events (
            id, tenant_id, name, version, actor, correlation_id, props, created_at
          ) VALUES (
            ${parsed.id}, ${parsed.tenantId}, ${parsed.name}, ${parsed.version},
            ${JSON.stringify(parsed.actor)}::jsonb, ${parsed.correlationId},
            ${JSON.stringify(parsed.props)}::jsonb,
            ${timestampParam(new Date(parsed.createdAt))}
          )
        `)
        .then(() => undefined)
    );
  }
}
