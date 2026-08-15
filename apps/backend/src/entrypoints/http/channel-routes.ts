import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  InvalidChannelCredentialsError,
  MissingAgentError,
  type VkConnectionService
} from '../../modules/channels/application/vk-connection-service.js';
import type { OwnerAccessTokenService } from '../../modules/tenancy/application/owner-access-token.js';
import { OwnerRequestGuard } from './owner-request-guard.js';
import { internalFailure, invalidRequest, notFound } from './problems.js';

export interface ChannelHttpOptions {
  readonly service: VkConnectionService;
  readonly accessTokens: OwnerAccessTokenService;
  readonly allowedOrigins: readonly string[];
}

const ChannelRoute = {
  Channels: '/api/v1/channels',
  Vk: '/api/v1/channels/vk'
} as const;

const VkConnectBodySchema = z.strictObject({
  accessKey: z.string().trim().min(1).max(500),
  groupId: z.coerce.number().int().positive()
});

/**
 * The cabinet's view of connected channels. Every route runs behind the owner
 * guard, and no response ever carries a credential — connected or not, the
 * owner sees a community name and a status.
 */
export function registerChannelRoutes(
  fastify: FastifyInstance,
  options: ChannelHttpOptions
): void {
  const guard = new OwnerRequestGuard({
    accessTokens: options.accessTokens,
    allowedOrigins: options.allowedOrigins
  });

  fastify.get(
    ChannelRoute.Channels,
    guard.read(async (_request, reply, owner) =>
      attempt(reply, async () => reply.code(200).send(await options.service.list(owner.tenantId)))
    )
  );

  fastify.post(
    ChannelRoute.Vk,
    guard.mutate(async (request, reply, owner) =>
      attempt(reply, async () => {
        const body = VkConnectBodySchema.safeParse(request.body);
        if (!body.success) {
          return invalidRequest(reply);
        }

        return reply.code(201).send(
          await options.service.connect({
            tenantId: owner.tenantId,
            userId: owner.userId,
            accessKey: body.data.accessKey,
            groupId: body.data.groupId
          })
        );
      })
    )
  );
}

/**
 * A refused key is a 400 without a reason: telling an owner which half of a
 * guess was wrong would tell a stranger the same. A tenant with no agent is a
 * 404, and anything else is ours to fix.
 */
async function attempt(
  reply: FastifyReply,
  operation: () => Promise<unknown>
): Promise<unknown> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof InvalidChannelCredentialsError) {
      return invalidRequest(reply);
    }
    if (error instanceof MissingAgentError) {
      return notFound(reply);
    }
    if (error instanceof z.ZodError) {
      return invalidRequest(reply);
    }

    return internalFailure(reply, 'channel connection failed', error);
  }
}
