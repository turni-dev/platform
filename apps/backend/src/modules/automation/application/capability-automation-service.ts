import { createHash } from 'node:crypto';
import { CreateGoogleCalendarEventResultSchema, type McpPort } from '@turni/contracts';
import type { AutomationPreset } from '../../agent-core/domain/automation-preset-catalogue.js';
import type { ToolCallTraceRecorder } from '../../observability/application/tool-call-trace-recorder.js';
import { zeroCost } from '../../observability/domain/tool-call-cost.js';
import { detectCapabilityIntent } from '../domain/capability-intent.js';
import type { CapabilityAutomationRequest } from '../domain/capability-automation-request.js';
import type { CapabilityAutomationRequestRepositoryPort } from './capability-automation-request-repository.port.js';

/** The two automation presets an owner must both allowlist before this
 * automation is offered to a guest — see `automation-preset-catalogue.ts`.
 * Default deny: missing either preset means the intent is silently ignored
 * and the guest falls through to the ordinary reply pipeline. */
const REQUIRED_PRESETS: readonly AutomationPreset[] = [
  'google.calendar.write',
  'google.sheets.write'
];

const CALENDAR_CREATE_CAPABILITY = 'google.calendar.events.create';
const SHEETS_APPEND_CAPABILITY = 'google.sheets.rows.append';

/** The operational spreadsheet tab this vertical slice writes booking rows
 * into. Letting an owner choose their own sheet/range is a cabinet concern
 * out of scope here; a fixed tab is enough to prove the capability-registry
 * path end to end. */
const AUDIT_SHEET_RANGE = 'Bookings!A:D';

export interface AutomationAgentLookupPort {
  findByTenant(
    tenantId: string
  ): Promise<Readonly<{ agentId: string; automationPresets: readonly string[] }> | undefined>;
}

export interface AutomationGoogleConnectionLookupPort {
  findByTenant(
    tenantId: string
  ): Promise<
    | Readonly<{
        id: string;
        status: string;
        calendarId: string | undefined;
        spreadsheetId: string | undefined;
      }>
    | undefined
  >;
}

export interface AutomationIdGeneratorPort {
  next(): string;
}

export interface RequestAutomationInput {
  readonly tenantId: string;
  readonly channel: 'vk';
  readonly guestRef: string;
  readonly text: string;
  readonly occurredAt: Date;
}

export type RequestAutomationOutcome =
  | Readonly<{ verdict: 'none' }>
  | Readonly<{ verdict: 'pending_approval'; requestId: string; response: string }>;

export class CapabilityAutomationNotFoundError extends Error {
  public constructor(id: string) {
    super(`No capability automation request ${id} exists for this tenant`);
    this.name = 'CapabilityAutomationNotFoundError';
  }
}

/** Thrown by `undo`: the McpPort capability registry deliberately has no
 * delete/undo capability for either Google port today (see the "deliberately
 * narrow" note in `packages/contracts/src/ports/google-integration.ts`).
 * Widening a port is its own reviewed card, so undo fails closed with a
 * clear reason instead of silently doing nothing. */
export class UndoNotSupportedError extends Error {
  public constructor(capabilityId: string) {
    super(
      `Capability ${capabilityId} has no registered undo/delete counterpart; ` +
        'widening the McpPort capability surface is a separate reviewed card.'
    );
    this.name = 'UndoNotSupportedError';
  }
}

const PENDING_APPROVAL_REPLY =
  'Передал заявку владельцу, он подтвердит бронирование в ближайшее время.';

/**
 * The capability-registry vertical slice: a VK message that looks like a
 * booking request is turned into a `CapabilityAutomationRequest` awaiting
 * explicit owner approval, never executed on the guest's say-so alone. Once
 * approved, exactly one attempt reaches McpPort per request — `decide` and
 * `execute` both go through repository transitions that only one caller can
 * ever win, so a retried approval click or a redelivered job can never
 * double-book or double-append.
 *
 * The audit trail is `ToolCallTraceRecorder` (see
 * `observability/application/tool-call-trace-recorder.ts`): it already
 * redacts every text leaf and exists precisely to record tool calls without
 * ever seeing conversation content, so this service never hands it the
 * guest's message or the Calendar event summary — only structural fields
 * (calendar id, whether a summary was set, row length).
 */
export class CapabilityAutomationService {
  public constructor(
    private readonly deps: Readonly<{
      requests: CapabilityAutomationRequestRepositoryPort;
      agents: AutomationAgentLookupPort;
      connections: AutomationGoogleConnectionLookupPort;
      mcp: McpPort;
      audit: ToolCallTraceRecorder;
      ids: AutomationIdGeneratorPort;
      clock: () => Date;
    }>
  ) {}

  public async requestAutomation(
    input: RequestAutomationInput
  ): Promise<RequestAutomationOutcome> {
    const intent = detectCapabilityIntent(input.text, input.occurredAt);
    if (intent.type !== 'calendar_booking') {
      return { verdict: 'none' };
    }

    const agent = await this.deps.agents.findByTenant(input.tenantId);
    if (agent === undefined || !REQUIRED_PRESETS.every((preset) => agent.automationPresets.includes(preset))) {
      return { verdict: 'none' };
    }

    const connection = await this.deps.connections.findByTenant(input.tenantId);
    if (
      connection === undefined ||
      connection.status !== 'active' ||
      connection.calendarId === undefined ||
      connection.spreadsheetId === undefined
    ) {
      return { verdict: 'none' };
    }

    const now = this.deps.clock().toISOString();
    const idempotencyKey = hashIdempotencyKey(
      input.tenantId,
      agent.agentId,
      input.guestRef,
      intent.startsAt,
      intent.endsAt
    );

    const request: CapabilityAutomationRequest = {
      id: this.deps.ids.next(),
      tenantId: input.tenantId,
      agentId: agent.agentId,
      connectionId: connection.id,
      channel: input.channel,
      guestRef: input.guestRef,
      idempotencyKey,
      status: 'pending_approval',
      calendarInput: {
        summary: intent.summary,
        startsAt: intent.startsAt,
        endsAt: intent.endsAt
      },
      calendarEventId: undefined,
      sheetsAppended: false,
      decidedBy: undefined,
      decidedAt: undefined,
      createdAt: now,
      updatedAt: now
    };

    const { request: stored } = await this.deps.requests.create(request);

    return {
      verdict: 'pending_approval',
      requestId: stored.id,
      response: PENDING_APPROVAL_REPLY
    };
  }

  public listPending(tenantId: string): Promise<readonly CapabilityAutomationRequest[]> {
    return this.deps.requests.listPending(tenantId);
  }

  public async reject(
    tenantId: string,
    requestId: string,
    ownerId: string
  ): Promise<CapabilityAutomationRequest> {
    const decidedAt = this.deps.clock().toISOString();
    const rejected = await this.deps.requests.reject(tenantId, requestId, ownerId, decidedAt);
    if (rejected !== undefined) {
      return rejected;
    }

    return this.load(tenantId, requestId);
  }

  /**
   * Approves the request and attempts execution in the same call. Approving
   * an already-decided request is idempotent: it returns the current state
   * without acting again, rather than erroring — an owner double-clicking
   * "approve" must never risk a second write.
   */
  public async approve(
    tenantId: string,
    requestId: string,
    ownerId: string
  ): Promise<CapabilityAutomationRequest> {
    const decidedAt = this.deps.clock().toISOString();
    const approved = await this.deps.requests.approve(tenantId, requestId, ownerId, decidedAt);
    if (approved === undefined) {
      // Already decided (approved/rejected) or already further along —
      // report the current state rather than re-approving.
      return this.load(tenantId, requestId);
    }

    return this.execute(approved);
  }

  /** Re-attempts execution of a request that previously failed partway
   * through (e.g. the calendar event was created but the process died before
   * the sheets row was appended). A no-op if nothing is claimable — that is
   * the idempotency guarantee. */
  public async retry(tenantId: string, requestId: string): Promise<CapabilityAutomationRequest> {
    const request = await this.load(tenantId, requestId);
    return this.execute(request);
  }

  public async undo(tenantId: string, requestId: string): Promise<never> {
    const request = await this.load(tenantId, requestId);
    if (request.calendarEventId !== undefined) {
      throw new UndoNotSupportedError('google.calendar.events.delete');
    }

    throw new UndoNotSupportedError(CALENDAR_CREATE_CAPABILITY);
  }

  private async execute(
    request: CapabilityAutomationRequest
  ): Promise<CapabilityAutomationRequest> {
    const claimed = await this.deps.requests.claimForExecution(request.tenantId, request.id);
    if (claimed === undefined) {
      // Another caller already claimed (or finished) this request — the
      // idempotency guard held. Report whatever the current state is.
      return this.load(request.tenantId, request.id);
    }

    try {
      let calendarEventId = claimed.calendarEventId;
      if (calendarEventId === undefined) {
        calendarEventId = await this.createCalendarEvent(claimed);
        await this.deps.requests.markCalendarCreated(
          claimed.tenantId,
          claimed.id,
          calendarEventId
        );
      }

      if (!claimed.sheetsAppended) {
        await this.appendSheetsRow(claimed, calendarEventId);
        await this.deps.requests.markSheetsAppended(claimed.tenantId, claimed.id);
      }

      return await this.deps.requests.markExecuted(claimed.tenantId, claimed.id);
    } catch (error) {
      await this.deps.audit.record({
        tenantId: claimed.tenantId,
        correlationId: claimed.id,
        actor: { type: 'system' },
        toolName: 'capability_automation.execute',
        params: { requestId: claimed.id },
        outcome: 'error',
        errorMessage: error instanceof Error ? error.name : 'unknown failure',
        cost: zeroCost('RUB'),
        occurredAt: this.deps.clock()
      });

      return this.deps.requests.markFailed(claimed.tenantId, claimed.id);
    }
  }

  private async createCalendarEvent(request: CapabilityAutomationRequest): Promise<string> {
    const connection = await this.deps.connections.findByTenant(request.tenantId);
    if (connection?.calendarId === undefined) {
      throw new Error('Google calendar connection is no longer configured');
    }

    const result = await this.deps.mcp.invoke({
      connectionId: request.connectionId,
      capabilityId: CALENDAR_CREATE_CAPABILITY,
      input: {
        calendarId: connection.calendarId,
        summary: request.calendarInput.summary,
        startsAt: request.calendarInput.startsAt,
        endsAt: request.calendarInput.endsAt
      }
    });

    const { eventId } = CreateGoogleCalendarEventResultSchema.parse(result.output);

    await this.deps.audit.record({
      tenantId: request.tenantId,
      correlationId: request.id,
      actor: { type: 'owner', id: request.decidedBy ?? 'unknown' },
      toolName: CALENDAR_CREATE_CAPABILITY,
      params: {
        calendarId: connection.calendarId,
        startsAt: request.calendarInput.startsAt,
        endsAt: request.calendarInput.endsAt,
        hasSummary: request.calendarInput.summary.length > 0
      },
      outcome: 'success',
      cost: zeroCost('RUB'),
      occurredAt: this.deps.clock()
    });

    return eventId;
  }

  private async appendSheetsRow(
    request: CapabilityAutomationRequest,
    calendarEventId: string
  ): Promise<void> {
    const connection = await this.deps.connections.findByTenant(request.tenantId);
    if (connection?.spreadsheetId === undefined) {
      throw new Error('Google sheets connection is no longer configured');
    }

    const values = [
      request.createdAt,
      request.guestRef,
      calendarEventId,
      request.calendarInput.startsAt
    ];

    await this.deps.mcp.invoke({
      connectionId: request.connectionId,
      capabilityId: SHEETS_APPEND_CAPABILITY,
      input: { spreadsheetId: connection.spreadsheetId, range: AUDIT_SHEET_RANGE, values }
    });

    await this.deps.audit.record({
      tenantId: request.tenantId,
      correlationId: request.id,
      actor: { type: 'owner', id: request.decidedBy ?? 'unknown' },
      toolName: SHEETS_APPEND_CAPABILITY,
      params: { spreadsheetId: connection.spreadsheetId, range: AUDIT_SHEET_RANGE, rowLength: values.length },
      outcome: 'success',
      cost: zeroCost('RUB'),
      occurredAt: this.deps.clock()
    });
  }

  private async load(tenantId: string, requestId: string): Promise<CapabilityAutomationRequest> {
    const request = await this.deps.requests.findById(tenantId, requestId);
    if (request === undefined) {
      throw new CapabilityAutomationNotFoundError(requestId);
    }
    return request;
  }
}

function hashIdempotencyKey(
  tenantId: string,
  agentId: string,
  guestRef: string,
  startsAt: string,
  endsAt: string
): string {
  return createHash('sha256')
    .update([tenantId, agentId, guestRef, startsAt, endsAt].join('|'))
    .digest('hex');
}
