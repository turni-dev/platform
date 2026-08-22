import { describe, expect, it } from 'vitest';
import type { McpInvocation, McpInvocationResult, McpPort } from '@turni/contracts';
import { FirstPartyMcpRegistry } from '../../../integrations/mcp/application/first-party-mcp-registry.js';
import { GoogleMcpProvider } from '../../../integrations/google/application/google-mcp-provider.js';
import { FakeGoogleCalendarTool } from '../../../integrations/google/application/fakes/fake-google-calendar-tool.js';
import { FakeGoogleSheetsTool } from '../../../integrations/google/application/fakes/fake-google-sheets-tool.js';
import { FakeDomainEventBus } from '../../../reporting/application/fake-domain-event-bus.js';
import { ToolCallTraceRecorder } from '../../../observability/application/tool-call-trace-recorder.js';
import {
  CapabilityAutomationService,
  UndoNotSupportedError,
  type AutomationAgentLookupPort,
  type AutomationGoogleConnectionLookupPort
} from '../capability-automation-service.js';
import { FakeCapabilityAutomationRequestRepository } from '../fake-capability-automation-request-repository.js';

const tenantId = '01900000-0000-7000-8000-000000000001';
const agentId = '01900000-0000-7000-8000-000000000002';
const connectionId = '01900000-0000-7000-8000-000000000003';
const ownerId = '01900000-0000-7000-8000-000000000004';
const occurredAt = new Date('2026-08-22T10:00:00.000Z');

class SequentialIds {
  private counter = 0;
  public next(): string {
    this.counter += 1;
    return `01900000-0000-7000-8000-${String(this.counter).padStart(12, '0')}`;
  }
}

function agentLookup(automationPresets: readonly string[]): AutomationAgentLookupPort {
  return { findByTenant: () => Promise.resolve({ agentId, automationPresets }) };
}

function connectionLookup(
  overrides: Partial<{
    status: string;
    calendarId: string | undefined;
    spreadsheetId: string | undefined;
  }> = {}
): AutomationGoogleConnectionLookupPort {
  return {
    findByTenant: () =>
      Promise.resolve({
      id: connectionId,
      status: overrides.status ?? 'active',
      calendarId: 'calendarId' in overrides ? overrides.calendarId : 'primary',
      spreadsheetId: 'spreadsheetId' in overrides ? overrides.spreadsheetId : 'sheet-1'
    })
  };
}

/** Wraps the real Fake-backed McpPort registry so a test can make the sheets
 * capability fail exactly once — proving a retry resumes instead of
 * re-creating the calendar event. */
class FlakyMcpPort implements McpPort {
  public failSheetsOnce = false;

  public constructor(private readonly inner: McpPort) {}

  public discover(input: Parameters<McpPort['discover']>[0]): ReturnType<McpPort['discover']> {
    return this.inner.discover(input);
  }

  public async invoke(input: McpInvocation): Promise<McpInvocationResult> {
    if (input.capabilityId === 'google.sheets.rows.append' && this.failSheetsOnce) {
      this.failSheetsOnce = false;
      throw new Error('transient sheets failure');
    }
    return this.inner.invoke(input);
  }
}

function harness(
  options: Readonly<{
    presets?: readonly string[];
    connection?: Partial<{
      status: string;
      calendarId: string | undefined;
      spreadsheetId: string | undefined;
    }>;
  }> = {}
) {
  const calendar = new FakeGoogleCalendarTool();
  const sheets = new FakeGoogleSheetsTool();
  const registry = new FirstPartyMcpRegistry([new GoogleMcpProvider(calendar, sheets)]);
  const mcp = new FlakyMcpPort(registry);
  const bus = new FakeDomainEventBus();
  const ids = new SequentialIds();
  const audit = new ToolCallTraceRecorder(bus, ids);
  const requests = new FakeCapabilityAutomationRequestRepository();

  const service = new CapabilityAutomationService({
    requests,
    agents: agentLookup(options.presets ?? ['google.calendar.write', 'google.sheets.write']),
    connections: connectionLookup(options.connection ?? {}),
    mcp,
    audit,
    ids,
    clock: () => occurredAt
  });

  return { service, calendar, sheets, mcp, bus, requests };
}

describe('CapabilityAutomationService.requestAutomation', () => {
  it('ignores text with no detectable booking intent', async () => {
    const { service } = harness();

    const outcome = await service.requestAutomation({
      tenantId,
      channel: 'vk',
      guestRef: 'vk:1',
      text: 'Здравствуйте!',
      occurredAt
    });

    expect(outcome).toEqual({ verdict: 'none' });
  });

  it('denies by default when the agent has not allowlisted both presets', async () => {
    const { service } = harness({ presets: ['google.calendar.write'] });

    const outcome = await service.requestAutomation({
      tenantId,
      channel: 'vk',
      guestRef: 'vk:1',
      text: 'Запишите меня на встречу в 18:00',
      occurredAt
    });

    expect(outcome).toEqual({ verdict: 'none' });
  });

  it('denies when there is no active Google connection', async () => {
    const { service } = harness({ connection: { status: 'pending' } });

    const outcome = await service.requestAutomation({
      tenantId,
      channel: 'vk',
      guestRef: 'vk:1',
      text: 'Запишите меня на встречу в 18:00',
      occurredAt
    });

    expect(outcome).toEqual({ verdict: 'none' });
  });

  it('creates a pending-approval request instead of executing anything', async () => {
    const { service, calendar, sheets } = harness();

    const outcome = await service.requestAutomation({
      tenantId,
      channel: 'vk',
      guestRef: 'vk:1',
      text: 'Запишите меня на встречу в 18:00',
      occurredAt
    });

    expect(outcome.verdict).toBe('pending_approval');
    expect(calendar.createEventCalls).toHaveLength(0);
    expect(sheets.appendRowCalls).toHaveLength(0);
  });

  it('is idempotent for the same tenant/guest/slot: a repeat never creates a second request', async () => {
    const { service, requests } = harness();
    const message = {
      tenantId,
      channel: 'vk' as const,
      guestRef: 'vk:1',
      text: 'Запишите меня на встречу в 18:00',
      occurredAt
    };

    const first = await service.requestAutomation(message);
    const second = await service.requestAutomation(message);

    expect(first.verdict).toBe('pending_approval');
    expect(second).toEqual(first);
    expect(await requests.listPending(tenantId)).toHaveLength(1);
  });
});

describe('CapabilityAutomationService.reject', () => {
  it('rejects a pending request and is idempotent on a repeat call', async () => {
    const { service } = harness();
    const { requestId } = (await service.requestAutomation({
      tenantId,
      channel: 'vk',
      guestRef: 'vk:1',
      text: 'Запишите меня на встречу в 18:00',
      occurredAt
    })) as { requestId: string };

    const first = await service.reject(tenantId, requestId, ownerId);
    const second = await service.reject(tenantId, requestId, ownerId);

    expect(first.status).toBe('rejected');
    expect(second.status).toBe('rejected');
    expect(second.decidedBy).toBe(first.decidedBy);
  });
});

describe('CapabilityAutomationService.approve', () => {
  async function createPending(service: CapabilityAutomationService): Promise<string> {
    const outcome = (await service.requestAutomation({
      tenantId,
      channel: 'vk',
      guestRef: 'vk:1',
      text: 'Запишите меня на встречу в 18:00',
      occurredAt
    })) as { requestId: string };
    return outcome.requestId;
  }

  it('creates the calendar event and appends the sheets audit row exactly once', async () => {
    const { service, calendar, sheets, bus } = harness();
    const requestId = await createPending(service);

    const executed = await service.approve(tenantId, requestId, ownerId);

    expect(executed.status).toBe('executed');
    expect(calendar.createEventCalls).toHaveLength(1);
    expect(sheets.appendRowCalls).toHaveLength(1);

    // Audit must never carry the guest's message or the calendar summary.
    const auditedProps = bus.publishedEvents.map((event) => JSON.stringify(event.props));
    for (const props of auditedProps) {
      expect(props).not.toContain('Запишите меня');
    }
  });

  it('never invokes McpPort twice even if approve is called again (double-click safety)', async () => {
    const { service, calendar, sheets } = harness();
    const requestId = await createPending(service);

    const first = await service.approve(tenantId, requestId, ownerId);
    const second = await service.approve(tenantId, requestId, ownerId);

    expect(first.status).toBe('executed');
    expect(second.status).toBe('executed');
    expect(calendar.createEventCalls).toHaveLength(1);
    expect(sheets.appendRowCalls).toHaveLength(1);
  });

  it('resumes from a partial failure without recreating the calendar event', async () => {
    const { service, calendar, sheets, mcp, requests } = harness();
    const requestId = await createPending(service);

    mcp.failSheetsOnce = true;
    const afterFailure = await service.approve(tenantId, requestId, ownerId);

    expect(afterFailure.status).toBe('failed');
    expect(calendar.createEventCalls).toHaveLength(1);
    expect(sheets.appendRowCalls).toHaveLength(0);

    const retried = await service.retry(tenantId, requestId);

    expect(retried.status).toBe('executed');
    expect(calendar.createEventCalls).toHaveLength(1); // not recreated
    expect(sheets.appendRowCalls).toHaveLength(1);
    expect(retried.calendarEventId).toBe((await requests.findById(tenantId, requestId))?.calendarEventId);
  });

  it('rejecting then approving is not possible: rejected requests stay rejected', async () => {
    const { service, calendar } = harness();
    const requestId = await createPending(service);

    await service.reject(tenantId, requestId, ownerId);
    const attempt = await service.approve(tenantId, requestId, ownerId);

    expect(attempt.status).toBe('rejected');
    expect(calendar.createEventCalls).toHaveLength(0);
  });
});

describe('CapabilityAutomationService.undo', () => {
  it('fails closed: the Google port has no delete/undo capability registered', async () => {
    const { service } = harness();
    const outcome = (await service.requestAutomation({
      tenantId,
      channel: 'vk',
      guestRef: 'vk:1',
      text: 'Запишите меня на встречу в 18:00',
      occurredAt
    })) as { requestId: string };
    await service.approve(tenantId, outcome.requestId, ownerId);

    await expect(service.undo(tenantId, outcome.requestId)).rejects.toThrow(
      UndoNotSupportedError
    );
  });
});
