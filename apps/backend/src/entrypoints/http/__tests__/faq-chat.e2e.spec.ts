import '@fastify/websocket';
import { GuestSessionSchema, type WidgetServerEvent } from '@turni/contracts';
import { describe, expect, it } from 'vitest';
import type { RawData } from 'ws';

import { createHttpApp } from '../app.js';
import { websocketPayloadToText } from '../websocket-payload.js';
import type { WidgetMessageHandler } from '../../../modules/channels/application/widget-chat-connection.js';
import { FaqChatPipeline } from '../../../modules/chat/application/faq-chat-pipeline.js';
import {
  FrontlineWorkflow,
  type FrontlineFaqEntry
} from '../../../modules/frontline/application/frontline-workflow.js';
import { FakePolicyClassifier } from '../../../modules/policy/application/fake-policy-classifier.js';
import { PolicyCascade } from '../../../modules/policy/application/policy-cascade.js';
import { PolicyEngine } from '../../../modules/policy/domain/policy-engine.js';
import { FakeDomainEventBus } from '../../../modules/reporting/application/fake-domain-event-bus.js';
import { WidgetRoutingKeyService } from '../../../modules/channels/application/widget-routing-key.js';
import { FakeGuestSessionContextResolver } from '../../../modules/channels/application/guest-session-context.js';
import type { GuestSessionContext } from '../../../modules/channels/application/guest-session-context.js';

const sessionSecret = 'test-session-secret-that-is-long-enough-for-hmac';
const routingSecret = 'test-routing-secret-that-is-long-enough-for-hmac';
const guestMessageId = '01900000-0000-7000-8000-000000000001';
const agentMessageId = '01900000-0000-7000-8000-000000000002';
const pipelineIds = {
  tenantId: '01900000-0000-7000-8000-000000000010',
  guestId: '01900000-0000-7000-8000-000000000011',
  eventId: '01900000-0000-7000-8000-000000000012',
  correlationId: '01900000-0000-7000-8000-000000000013'
} as const;

function routingFixture(): Readonly<{ widgetKey: string; context: GuestSessionContext }> {
  const claims = {
    tenantId: pipelineIds.tenantId,
    agentId: '01900000-0000-7000-8000-000000000014',
    connectionId: '01900000-0000-7000-8000-000000000015',
    expiresAt: Math.floor(Date.now() / 1_000) + 3_600,
    kid: 'test'
  };
  return {
    widgetKey: new WidgetRoutingKeyService(routingSecret).issue(claims),
    context: {
      tenantId: claims.tenantId,
      agentId: claims.agentId,
      connectionId: claims.connectionId,
      sessionId: '01900000-0000-7000-8000-000000000016'
    }
  };
}

async function issueSession(
  app: Awaited<ReturnType<typeof createHttpApp>>,
  widgetKey: string
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/guest/sessions',
    payload: { widgetKey }
  });

  return GuestSessionSchema.parse(response.json()).token;
}

function receiveEvents(
  socket: { once(event: 'message', listener: (data: RawData) => void): unknown },
  count: number
): Promise<readonly WidgetServerEvent[]> {
  return new Promise((resolve) => {
    const events: WidgetServerEvent[] = [];
    const receiveNext = (data: RawData): void => {
      events.push(JSON.parse(websocketPayloadToText(data)) as WidgetServerEvent);
      if (events.length === count) {
        resolve(events);
        return;
      }
      socket.once('message', receiveNext);
    };
    socket.once('message', receiveNext);
  });
}

function createPipelineHandler(entries: readonly FrontlineFaqEntry[]): Readonly<{
  handler: WidgetMessageHandler;
  events: FakeDomainEventBus;
  frontlineCalls: () => number;
}> {
  const events = new FakeDomainEventBus();
  const workflow = new FrontlineWorkflow(entries);
  let frontlineCallCount = 0;
  const cascade = new PolicyCascade(
    new PolicyEngine(),
    new FakePolicyClassifier([
      {
        confidence: 0.9,
        candidates: [{ verdict: 'auto', riskScore: 1, rule: 'test-faq' }]
      }
    ]),
    new FakePolicyClassifier()
  );
  const pipeline = new FaqChatPipeline(
    { evaluate: (input) => cascade.evaluate(input) },
    {
      answer: (input) => {
        frontlineCallCount += 1;
        return workflow.answer(input);
      }
    },
    events
  );

  return {
    handler: async ({ receivedAt, text }) => {
      const result = await pipeline.handle({
        ...pipelineIds,
        occurredAt: receivedAt.toISOString(),
        text
      });
      return [
        {
          type: 'message.new',
          id: agentMessageId,
          role: 'agent',
          text: result.response,
          ts: receivedAt.toISOString()
        }
      ];
    },
    events,
    frontlineCalls: () => frontlineCallCount
  };
}

describe('FAQ chat WebSocket composition', () => {
  it('delivers a completed FAQ agent reply without a token stream', async () => {
    const routing = routingFixture();
    const pipeline = createPipelineHandler([
      {
        tenantId: pipelineIds.tenantId,
        question: 'Когда вы работаете?',
        response: 'Мы работаем ежедневно с 10:00 до 22:00.'
      }
    ]);
    const app = await createHttpApp({
      guestSessionSecret: sessionSecret,
      widgetRoutingSecret: routingSecret,
      widgetMessageHandler: pipeline.handler,
      guestSessionContextResolver: new FakeGuestSessionContextResolver({
        [routing.widgetKey]: routing.context
      })
    });

    try {
      const sessionToken = await issueSession(app, routing.widgetKey);
      const fastify = app.getHttpAdapter().getInstance();
      const socket = await fastify.injectWS('/api/v1/guest/chat');
      try {
        const sessionEvents = receiveEvents(socket, 1);
        socket.send(JSON.stringify({ type: 'session.resume', token: sessionToken }));
        await sessionEvents;

        const messageEvents = receiveEvents(socket, 3);
        socket.send(
          JSON.stringify({
            type: 'message.send',
            clientMsgId: guestMessageId,
            text: 'Когда вы работаете?'
          })
        );
        const events = await messageEvents;

        expect(events).toContainEqual(
          expect.objectContaining({
            type: 'message.new',
            id: agentMessageId,
            role: 'agent',
            text: 'Мы работаем ежедневно с 10:00 до 22:00.'
          })
        );
        expect(JSON.stringify(events)).not.toContain('draft.delta');
        expect(pipeline.frontlineCalls()).toBe(1);
        expect(pipeline.events.publishedEvents.map((event) => event.name)).toEqual([
          'frontline.answered'
        ]);
      } finally {
        socket.terminate();
      }
    } finally {
      await app.close();
    }
  });

  it('delivers only a safe completed handoff for an allergen question', async () => {
    const handoff = 'Передам ваш вопрос администратору.';
    const pipeline = createPipelineHandler([
      {
        tenantId: pipelineIds.tenantId,
        question: 'В блюде есть арахис? У меня аллергия.',
        response: 'Не должно быть отправлено.'
      }
    ]);
    const routing = routingFixture();
    const app = await createHttpApp({
      guestSessionSecret: sessionSecret,
      widgetRoutingSecret: routingSecret,
      widgetMessageHandler: pipeline.handler,
      guestSessionContextResolver: new FakeGuestSessionContextResolver({
        [routing.widgetKey]: routing.context
      })
    });

    try {
      const sessionToken = await issueSession(app, routing.widgetKey);
      const fastify = app.getHttpAdapter().getInstance();
      const socket = await fastify.injectWS('/api/v1/guest/chat');
      try {
        const sessionEvents = receiveEvents(socket, 1);
        socket.send(JSON.stringify({ type: 'session.resume', token: sessionToken }));
        await sessionEvents;

        const messageEvents = receiveEvents(socket, 3);
        socket.send(
          JSON.stringify({
            type: 'message.send',
            clientMsgId: guestMessageId,
            text: 'В блюде есть арахис? У меня аллергия.'
          })
        );
        const events = await messageEvents;

        const agentReplies = events.filter(
          (event) => event.type === 'message.new' && event.role === 'agent'
        );
        expect(agentReplies).toHaveLength(1);
        expect(agentReplies[0]).toMatchObject({ text: handoff });
        expect(JSON.stringify(events)).not.toContain('draft.delta');
        expect(pipeline.frontlineCalls()).toBe(0);
        expect(pipeline.events.publishedEvents.map((event) => event.name)).toEqual(['risk.assessed']);
      } finally {
        socket.terminate();
      }
    } finally {
      await app.close();
    }
  });
});
