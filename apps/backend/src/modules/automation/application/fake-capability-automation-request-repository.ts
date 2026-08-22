import type { CapabilityAutomationRequest } from '../domain/capability-automation-request.js';
import type { CapabilityAutomationRequestRepositoryPort } from './capability-automation-request-repository.port.js';

function key(tenantId: string, id: string): string {
  return `${tenantId}:${id}`;
}

function idempotencyKeyOf(tenantId: string, idempotencyKey: string): string {
  return `${tenantId}:${idempotencyKey}`;
}

/** In-memory mirror of the Postgres repository's guarded transitions, so
 * application-layer tests can prove the idempotency guarantee (a second
 * `claimForExecution` call never wins) without a database. */
export class FakeCapabilityAutomationRequestRepository
  implements CapabilityAutomationRequestRepositoryPort
{
  private readonly byId = new Map<string, CapabilityAutomationRequest>();
  private readonly idByIdempotencyKey = new Map<string, string>();

  public findById(tenantId: string, id: string): Promise<CapabilityAutomationRequest | undefined> {
    return Promise.resolve(this.byId.get(key(tenantId, id)));
  }

  public findByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string
  ): Promise<CapabilityAutomationRequest | undefined> {
    const id = this.idByIdempotencyKey.get(idempotencyKeyOf(tenantId, idempotencyKey));
    return Promise.resolve(id === undefined ? undefined : this.byId.get(key(tenantId, id)));
  }

  public listPending(tenantId: string): Promise<readonly CapabilityAutomationRequest[]> {
    return Promise.resolve(
      [...this.byId.values()].filter(
        (request) => request.tenantId === tenantId && request.status === 'pending_approval'
      )
    );
  }

  public create(
    request: CapabilityAutomationRequest
  ): Promise<Readonly<{ request: CapabilityAutomationRequest; created: boolean }>> {
    const existingId = this.idByIdempotencyKey.get(
      idempotencyKeyOf(request.tenantId, request.idempotencyKey)
    );
    if (existingId !== undefined) {
      const existing = this.byId.get(key(request.tenantId, existingId));
      if (existing !== undefined) {
        return Promise.resolve({ request: existing, created: false });
      }
    }

    this.byId.set(key(request.tenantId, request.id), request);
    this.idByIdempotencyKey.set(
      idempotencyKeyOf(request.tenantId, request.idempotencyKey),
      request.id
    );
    return Promise.resolve({ request, created: true });
  }

  public approve(
    tenantId: string,
    id: string,
    decidedBy: string,
    decidedAt: string
  ): Promise<CapabilityAutomationRequest | undefined> {
    return Promise.resolve(
      this.transition(tenantId, id, ['pending_approval'], {
        status: 'approved',
        decidedBy,
        decidedAt,
        updatedAt: decidedAt
      })
    );
  }

  public reject(
    tenantId: string,
    id: string,
    decidedBy: string,
    decidedAt: string
  ): Promise<CapabilityAutomationRequest | undefined> {
    return Promise.resolve(
      this.transition(tenantId, id, ['pending_approval'], {
        status: 'rejected',
        decidedBy,
        decidedAt,
        updatedAt: decidedAt
      })
    );
  }

  public claimForExecution(
    tenantId: string,
    id: string
  ): Promise<CapabilityAutomationRequest | undefined> {
    return Promise.resolve(
      this.transition(tenantId, id, ['approved', 'failed'], { status: 'executing' })
    );
  }

  public markCalendarCreated(tenantId: string, id: string, calendarEventId: string): Promise<void> {
    this.mutate(tenantId, id, { calendarEventId });
    return Promise.resolve();
  }

  public markSheetsAppended(tenantId: string, id: string): Promise<void> {
    this.mutate(tenantId, id, { sheetsAppended: true });
    return Promise.resolve();
  }

  public markExecuted(tenantId: string, id: string): Promise<CapabilityAutomationRequest> {
    return Promise.resolve(this.mutate(tenantId, id, { status: 'executed' }));
  }

  public markFailed(tenantId: string, id: string): Promise<CapabilityAutomationRequest> {
    return Promise.resolve(this.mutate(tenantId, id, { status: 'failed' }));
  }

  private transition(
    tenantId: string,
    id: string,
    expected: readonly CapabilityAutomationRequest['status'][],
    patch: Partial<CapabilityAutomationRequest>
  ): CapabilityAutomationRequest | undefined {
    const current = this.byId.get(key(tenantId, id));
    if (current === undefined || !expected.includes(current.status)) {
      return undefined;
    }

    return this.mutate(tenantId, id, patch);
  }

  private mutate(
    tenantId: string,
    id: string,
    patch: Partial<CapabilityAutomationRequest>
  ): CapabilityAutomationRequest {
    const current = this.byId.get(key(tenantId, id));
    if (current === undefined) {
      throw new Error(`No capability automation request ${id} for this tenant`);
    }

    const next = { ...current, ...patch };
    this.byId.set(key(tenantId, id), next);
    return next;
  }
}
