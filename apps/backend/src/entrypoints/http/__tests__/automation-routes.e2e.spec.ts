import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHttpApp } from '../app.js';
import { FakeDomainEventBus } from '../../../modules/reporting/application/fake-domain-event-bus.js';
import { ToolCallTraceRecorder } from '../../../modules/observability/application/tool-call-trace-recorder.js';
import { FirstPartyMcpRegistry } from '../../../modules/integrations/mcp/application/first-party-mcp-registry.js';
import { GoogleMcpProvider } from '../../../modules/integrations/google/application/google-mcp-provider.js';
import { FakeGoogleCalendarTool } from '../../../modules/integrations/google/application/fakes/fake-google-calendar-tool.js';
import { FakeGoogleSheetsTool } from '../../../modules/integrations/google/application/fakes/fake-google-sheets-tool.js';
import { CapabilityAutomationService } from '../../../modules/automation/application/capability-automation-service.js';
import { FakeCapabilityAutomationRequestRepository } from '../../../modules/automation/application/fake-capability-automation-request-repository.js';
import { OwnerAccessTokenService } from '../../../modules/tenancy/application/owner-access-token.js';
import { AuthCookieName } from '../auth-cookies.js';

const origin = 'https://app.turni.ru';
const tenantId = '01900000-0000-7000-8000-000000000010';
const userId = '01900000-0000-7000-8000-000000000011';
const agentId = '01900000-0000-7000-8000-000000000012';
const connectionId = '01900000-0000-7000-8000-000000000013';
const sessionId = '01900000-0000-7000-8000-000000000015';
const ownerAuthSecret = 'owner-auth-secret-with-at-least-thirty-two-characters';

function cookie(token: string): string {
  return `${AuthCookieName.Access}=${token}`;
}

function build() {
  const accessTokens = new OwnerAccessTokenService(ownerAuthSecret);
  const events = new FakeDomainEventBus();
  let sequence = 0;
  const ids = {
    next: (): string => {
      sequence += 1;
      return `01900000-0000-7000-8000-0000000002${String(sequence).padStart(2, '0')}`;
    }
  };

  const calendar = new FakeGoogleCalendarTool();
  const sheets = new FakeGoogleSheetsTool();
  const mcp = new FirstPartyMcpRegistry([new GoogleMcpProvider(calendar, sheets)]);
  const requests = new FakeCapabilityAutomationRequestRepository();
  const service = new CapabilityAutomationService({
    requests,
    agents: {
      findByTenant: () =>
        Promise.resolve({
          agentId,
          automationPresets: ['google.calendar.write', 'google.sheets.write']
        })
    },
    connections: {
      findByTenant: () =>
        Promise.resolve({
          id: connectionId,
          status: 'active',
          calendarId: 'primary',
          spreadsheetId: 'sheet-1'
        })
    },
    mcp,
    audit: new ToolCallTraceRecorder(events, ids),
    ids,
    clock: () => new Date('2026-08-22T10:00:00.000Z')
  });

  return {
    accessTokens,
    service,
    requests,
    calendar,
    sheets,
    app: createHttpApp({
      automations: { service, accessTokens, allowedOrigins: [origin] }
    })
  };
}

describe('Automation approval HTTP routes', () => {
  let context: ReturnType<typeof build>;
  let app: Awaited<ReturnType<typeof createHttpApp>>;

  beforeEach(async () => {
    context = build();
    app = await context.app;
  });

  afterEach(async () => {
    await app.close();
  });

  it('refuses an unauthenticated read of the pending queue', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/automations/pending' });

    expect(response.statusCode).toBe(401);
  });

  it('lists a pending request, approves it, and never lets a second approve re-execute', async () => {
    const outcome = await context.service.requestAutomation({
      tenantId,
      channel: 'vk',
      guestRef: 'vk:1',
      text: 'Запишите меня на встречу в 18:00',
      occurredAt: new Date('2026-08-22T10:00:00.000Z')
    });
    if (outcome.verdict !== 'pending_approval') {
      throw new Error('expected the fixture message to create a pending approval');
    }

    const token = context.accessTokens.issue({ userId, tenantId, sessionId });

    const pendingResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/automations/pending',
      headers: { cookie: cookie(token) }
    });
    expect(pendingResponse.statusCode).toBe(200);
    const pending = pendingResponse.json<readonly { id: string }[]>();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).toBe(outcome.requestId);

    const approveResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/automations/${outcome.requestId}/approve`,
      headers: { origin, cookie: cookie(token) }
    });
    expect(approveResponse.statusCode).toBe(200);
    expect(approveResponse.json()).toEqual({ id: outcome.requestId, status: 'executed' });
    expect(context.calendar.createEventCalls).toHaveLength(1);
    expect(context.sheets.appendRowCalls).toHaveLength(1);

    const secondApprove = await app.inject({
      method: 'POST',
      url: `/api/v1/automations/${outcome.requestId}/approve`,
      headers: { origin, cookie: cookie(token) }
    });
    expect(secondApprove.statusCode).toBe(200);
    expect(context.calendar.createEventCalls).toHaveLength(1);
    expect(context.sheets.appendRowCalls).toHaveLength(1);
  });

  it('refuses an approval without a trusted origin', async () => {
    const outcome = await context.service.requestAutomation({
      tenantId,
      channel: 'vk',
      guestRef: 'vk:1',
      text: 'Запишите меня на встречу в 18:00',
      occurredAt: new Date('2026-08-22T10:00:00.000Z')
    });
    if (outcome.verdict !== 'pending_approval') {
      throw new Error('expected the fixture message to create a pending approval');
    }
    const token = context.accessTokens.issue({ userId, tenantId, sessionId });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/automations/${outcome.requestId}/approve`,
      headers: { cookie: cookie(token) }
    });

    expect(response.statusCode).toBe(403);
    expect(context.calendar.createEventCalls).toHaveLength(0);
  });

  it('rejects a pending request and leaves it rejected', async () => {
    const outcome = await context.service.requestAutomation({
      tenantId,
      channel: 'vk',
      guestRef: 'vk:1',
      text: 'Запишите меня на встречу в 18:00',
      occurredAt: new Date('2026-08-22T10:00:00.000Z')
    });
    if (outcome.verdict !== 'pending_approval') {
      throw new Error('expected the fixture message to create a pending approval');
    }
    const token = context.accessTokens.issue({ userId, tenantId, sessionId });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/automations/${outcome.requestId}/reject`,
      headers: { origin, cookie: cookie(token) }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: outcome.requestId, status: 'rejected' });
    expect(context.calendar.createEventCalls).toHaveLength(0);
  });
});
