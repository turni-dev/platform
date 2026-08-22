import type { CapabilityAutomationRequest } from '../domain/capability-automation-request.js';

/**
 * Every mutating method here is a guarded state transition, not a blind
 * write: the Postgres implementation expresses each one as an
 * `UPDATE ... WHERE status = '<expected>'`, so a concurrent or retried call
 * can only ever win the transition once. A transition method returning
 * `undefined` means "this row was not in the state I could act on" — the
 * caller must reload and decide what that means (already decided, already
 * executing, ...), never retry blindly.
 */
export interface CapabilityAutomationRequestRepositoryPort {
  findById(tenantId: string, id: string): Promise<CapabilityAutomationRequest | undefined>;
  findByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string
  ): Promise<CapabilityAutomationRequest | undefined>;
  listPending(tenantId: string): Promise<readonly CapabilityAutomationRequest[]>;

  /** Inserts a new `pending_approval` row unless one already exists for
   * `(tenantId, idempotencyKey)`, in which case the existing row is returned
   * unchanged — the caller never has to branch on "did I just create this or
   * find it". */
  create(
    request: CapabilityAutomationRequest
  ): Promise<Readonly<{ request: CapabilityAutomationRequest; created: boolean }>>;

  approve(
    tenantId: string,
    id: string,
    decidedBy: string,
    decidedAt: string
  ): Promise<CapabilityAutomationRequest | undefined>;

  reject(
    tenantId: string,
    id: string,
    decidedBy: string,
    decidedAt: string
  ): Promise<CapabilityAutomationRequest | undefined>;

  /** `approved` or `failed` -> `executing`. This is the idempotency guard for
   * the vendor write: only the caller that wins this claim may invoke
   * McpPort. */
  claimForExecution(tenantId: string, id: string): Promise<CapabilityAutomationRequest | undefined>;

  markCalendarCreated(tenantId: string, id: string, calendarEventId: string): Promise<void>;
  markSheetsAppended(tenantId: string, id: string): Promise<void>;
  markExecuted(tenantId: string, id: string): Promise<CapabilityAutomationRequest>;
  markFailed(tenantId: string, id: string): Promise<CapabilityAutomationRequest>;
}
