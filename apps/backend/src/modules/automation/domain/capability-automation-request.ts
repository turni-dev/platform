/**
 * One personal-automation request end to end: a detected intent that needs an
 * external write, gated on owner approval, executed at most once through
 * McpPort. `idempotencyKey` is the dedupe key a repeated inbound delivery (or
 * a retried approval click) folds onto — see
 * `capability-automation-service.ts` for how each status transition is
 * guarded so a retry can never re-invoke a capability that already ran.
 */
export type CapabilityAutomationStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'executed'
  | 'failed';

export interface CalendarBookingInput {
  readonly summary: string;
  readonly startsAt: string;
  readonly endsAt: string;
}

export interface CapabilityAutomationRequest {
  readonly id: string;
  readonly tenantId: string;
  readonly agentId: string;
  readonly connectionId: string;
  readonly channel: 'vk';
  /** The provider's own identifier for the guest, e.g. VK peer id. Never the
   * message body. */
  readonly guestRef: string;
  readonly idempotencyKey: string;
  readonly status: CapabilityAutomationStatus;
  readonly calendarInput: CalendarBookingInput;
  readonly calendarEventId: string | undefined;
  readonly sheetsAppended: boolean;
  readonly decidedBy: string | undefined;
  readonly decidedAt: string | undefined;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const TERMINAL_STATUSES: ReadonlySet<CapabilityAutomationStatus> = new Set([
  'rejected',
  'executed'
]);

export function isTerminal(status: CapabilityAutomationStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/** The write is only "done" once both the calendar event and the sheets
 * audit row exist — either alone is a partially executed request that a
 * retry must be able to finish without repeating the half that already
 * succeeded. */
export function isFullyExecuted(request: CapabilityAutomationRequest): boolean {
  return request.calendarEventId !== undefined && request.sheetsAppended;
}
