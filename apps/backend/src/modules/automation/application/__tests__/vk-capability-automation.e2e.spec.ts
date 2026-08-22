import { beforeEach, describe, expect, it } from 'vitest';
import { FakeMessenger } from '../../../../platform/fakes/core-fakes.js';
import { FakeDomainEventBus } from '../../../reporting/application/fake-domain-event-bus.js';
import { ChannelAnalytics } from '../../../channels/application/channel-analytics.js';
import type {
  ConversationResolution,
  GuestConversationStorePort,
  GuestResolution,
  MessageAppend
} from '../../../channels/application/guest-conversation-store.port.js';
import type { WebhookInboxClaim, WebhookInboxPort } from '../../../channels/application/webhook-inbox.port.js';
import { InboundMessageService, type InboundChannelMessage } from '../../../channels/application/inbound-message-service.js';
import { FirstPartyMcpRegistry } from '../../../integrations/mcp/application/first-party-mcp-registry.js';
import { GoogleMcpProvider } from '../../../integrations/google/application/google-mcp-provider.js';
import { FakeGoogleCalendarTool } from '../../../integrations/google/application/fakes/fake-google-calendar-tool.js';
import { FakeGoogleSheetsTool } from '../../../integrations/google/application/fakes/fake-google-sheets-tool.js';
import { ToolCallTraceRecorder } from '../../../observability/application/tool-call-trace-recorder.js';
import { CapabilityAutomationService } from '../capability-automation-service.js';
import { FakeCapabilityAutomationRequestRepository } from '../fake-capability-automation-request-repository.js';
import { AutomationAnswerPipeline } from '../automation-answer-pipeline.js';

const tenantId = '01900000-0000-7000-8000-000000000010';
const agentId = '01900000-0000-7000-8000-000000000011';
const connectionId = '01900000-0000-7000-8000-000000000012';
const ownerId = '01900000-0000-7000-8000-000000000099';

class InMemoryInbox implements WebhookInboxPort {
  public readonly rows = new Map<string, 'received' | 'processed' | 'failed'>();

  public claim(claim: WebhookInboxClaim): Promise<'claimed' | 'duplicate'> {
    const status = this.rows.get(claim.externalId);
    if (status === 'received' || status === 'processed') {
      return Promise.resolve('duplicate');
    }
    this.rows.set(claim.externalId, 'received');
    return Promise.resolve('claimed');
  }

  public markProcessed(input: Readonly<{ externalId: string }>): Promise<void> {
    this.rows.set(input.externalId, 'processed');
    return Promise.resolve();
  }

  public markFailed(input: Readonly<{ externalId: string }>): Promise<void> {
    this.rows.set(input.externalId, 'failed');
    return Promise.resolve();
  }
}

class InMemoryStore implements GuestConversationStorePort {
  public readonly guests = new Map<string, string>();
  public readonly conversations = new Map<string, string>();
  public readonly messages: MessageAppend[] = [];

  public resolveGuest(input: GuestResolution): Promise<string> {
    const key = `${input.tenantId}:${input.channelRef}`;
    const existing = this.guests.get(key);
    if (existing !== undefined) return Promise.resolve(existing);
    this.guests.set(key, input.guestId);
    return Promise.resolve(input.guestId);
  }

  public resolveConversation(input: ConversationResolution): Promise<string> {
    const key = `${input.connectionId}:${input.guestId}`;
    const existing = this.conversations.get(key);
    if (existing !== undefined) return Promise.resolve(existing);
    this.conversations.set(key, input.conversationId);
    return Promise.resolve(input.conversationId);
  }

  public appendMessage(input: MessageAppend): Promise<void> {
    this.messages.push(input);
    return Promise.resolve();
  }
}

function inboundMessage(overrides: Partial<InboundChannelMessage> = {}): InboundChannelMessage {
  return {
    tenantId,
    agentId,
    connectionId,
    channel: 'vk',
    eventId: 'event-1',
    senderRef: '777',
    text: 'Запишите меня на встречу в 18:00',
    payload: { type: 'message_new' },
    occurredAt: new Date('2026-08-22T10:00:00.000Z'),
    ...overrides
  };
}

function build() {
  const inbox = new InMemoryInbox();
  const store = new InMemoryStore();
  const messenger = new FakeMessenger();
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
  const audit = new ToolCallTraceRecorder(events, ids);
  const requests = new FakeCapabilityAutomationRequestRepository();

  const automations = new CapabilityAutomationService({
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
    audit,
    ids,
    clock: () => new Date('2026-08-22T10:00:00.000Z')
  });

  const service = new InboundMessageService({
    inbox,
    store,
    ids,
    analytics: new ChannelAnalytics(events, ids),
    pipeline: new AutomationAnswerPipeline(automations, {
      handle: () =>
        Promise.resolve({ verdict: 'auto', response: 'Мы работаем с 10:00 до 22:00.' })
    }),
    messenger: () => messenger
  });

  return { service, inbox, store, messenger, events, automations, calendar, sheets, requests };
}

describe('VK inbound booking intent through the capability registry (Fake e2e)', () => {
  let context: ReturnType<typeof build>;

  beforeEach(() => {
    context = build();
  });

  it('never writes to Calendar/Sheets before an explicit owner approval', async () => {
    await expect(context.service.handle(inboundMessage())).resolves.toBe('answered');

    expect(context.messenger.sent[0]?.message.content).toEqual({
      type: 'text',
      text: 'Передал заявку владельцу, он подтвердит бронирование в ближайшее время.'
    });
    expect(context.calendar.createEventCalls).toHaveLength(0);
    expect(context.sheets.appendRowCalls).toHaveLength(0);
  });

  it('executes the approved write exactly once and records an audit trail without the message body', async () => {
    await context.service.handle(inboundMessage());

    const [pending] = await context.automations.listPending(tenantId);
    if (pending === undefined) {
      throw new Error('expected a pending automation request');
    }

    const approved = await context.automations.approve(tenantId, pending.id, ownerId);

    expect(approved.status).toBe('executed');
    expect(context.calendar.createEventCalls).toHaveLength(1);
    expect(context.sheets.appendRowCalls).toHaveLength(1);

    const serializedAudit = JSON.stringify(context.events.publishedEvents);
    expect(serializedAudit).not.toContain('Запишите меня');
  });

  it('a redelivered webhook never creates a second automation request', async () => {
    await context.service.handle(inboundMessage());
    await expect(context.service.handle(inboundMessage())).resolves.toBe('duplicate');

    expect(await context.automations.listPending(tenantId)).toHaveLength(1);
  });

  it('falls through to the ordinary reply pipeline for non-booking messages', async () => {
    await context.service.handle(inboundMessage({ eventId: 'event-2', text: 'Когда вы работаете?' }));

    expect(context.messenger.sent[0]?.message.content).toEqual({
      type: 'text',
      text: 'Мы работаем с 10:00 до 22:00.'
    });
    expect(await context.automations.listPending(tenantId)).toHaveLength(0);
  });
});
