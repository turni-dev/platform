import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { ChannelAnalytics } from '../../modules/channels/application/channel-analytics.js';
import type { ChannelConnectionRepositoryPort } from '../../modules/channels/application/channel-connection-repository.port.js';
import type { InboundMessageService } from '../../modules/channels/application/inbound-message-service.js';
import type { WebhookRoutingKeyService } from '../../modules/channels/application/webhook-routing-key.js';
import { parseVkCallback } from '../../platform/integrations/vk/vk-callback.js';
import { forbidden } from './problems.js';

export interface VkWebhookHttpOptions {
  readonly routingKeys: WebhookRoutingKeyService;
  readonly connections: ChannelConnectionRepositoryPort;
  readonly inbound: InboundMessageService;
  readonly analytics: ChannelAnalytics;
  readonly clock?: () => Date;
}

const VkWebhookRoute = '/api/v1/webhooks/vk/:routingKey';

/**
 * The public entrance of the VK channel. It is reachable without a session, so
 * everything it trusts has to be proven: the routing key is ours because it is
 * signed, and the caller is VK because it echoes the secret we registered.
 *
 * VK expects the literal `ok` on an event and the confirmation code on a
 * confirmation, and it retries on anything else — which is exactly the
 * redelivery we rely on instead of a queue.
 */
export function registerVkWebhookRoutes(
  fastify: FastifyInstance,
  options: VkWebhookHttpOptions
): void {
  const clock = options.clock ?? ((): Date => new Date());

  fastify.post(VkWebhookRoute, async (request, reply) => {
    const routingKey = (request.params as Readonly<{ routingKey?: string }>).routingKey;
    if (routingKey === undefined) {
      return forbidden(reply);
    }

    let claims;
    try {
      claims = options.routingKeys.verify(routingKey);
    } catch {
      return forbidden(reply);
    }

    const connection = await options.connections.findById({
      tenantId: claims.tenantId,
      connectionId: claims.connectionId
    });
    if (connection === undefined) {
      return forbidden(reply);
    }

    let callback;
    try {
      callback = parseVkCallback(request.body);
    } catch {
      // A body we cannot read is not worth a retry, and saying why would tell
      // a stranger how close a guess was.
      return forbidden(reply);
    }

    if (
      callback.secret !== undefined &&
      !matches(callback.secret, connection.webhookSecret)
    ) {
      return forbidden(reply);
    }

    if (callback.type === 'confirmation') {
      const code = connection.metadata['confirmation_code'];
      if (typeof code !== 'string') {
        return forbidden(reply);
      }

      if (await options.connections.activate({
        tenantId: claims.tenantId,
        connectionId: claims.connectionId
      })) {
        await options.analytics.confirmed({
          tenantId: claims.tenantId,
          connectionId: claims.connectionId,
          channel: 'vk',
          at: clock()
        });
      }

      return reply.code(200).type('text/plain').send(code);
    }

    if (!matches(callback.secret, connection.webhookSecret)) {
      return forbidden(reply);
    }

    await options.inbound.handle({
      tenantId: claims.tenantId,
      agentId: connection.agentId,
      connectionId: claims.connectionId,
      channel: 'vk',
      eventId: callback.eventId,
      senderRef: callback.peerId,
      text: callback.text,
      payload: { type: callback.type, event_id: callback.eventId },
      occurredAt: clock()
    });

    return reply.code(200).type('text/plain').send('ok');
  });
}

/** Constant-time and length-safe: a secret comparison must not leak how much
 * of a guess was right. */
function matches(presented: string, expected: string): boolean {
  const left = Buffer.from(presented);
  const right = Buffer.from(expected);

  return left.length === right.length && timingSafeEqual(left, right);
}
