import {
  AgentInstructionsUpdateSchema,
  AutomationAllowlistUpdateSchema,
  KnowledgeFilePathSchema,
  KnowledgeFileUpsertSchema
} from '@turni/contracts';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  AgentNotConfiguredError,
  type AgentConfigurationService
} from '../../modules/agent-core/application/agent-configuration-service.js';
import type { OwnerAccessTokenService } from '../../modules/tenancy/application/owner-access-token.js';
import type { OwnerRegistrationRepositoryPort } from '../../modules/tenancy/application/owner-registration-repository.port.js';
import { OwnerRequestGuard } from './owner-request-guard.js';
import { internalFailure, invalidRequest, notFound } from './problems.js';

export interface AgentHttpOptions {
  readonly service: AgentConfigurationService;
  readonly owners: Pick<OwnerRegistrationRepositoryPort, 'findOwnerProfile'>;
  readonly accessTokens: OwnerAccessTokenService;
  readonly allowedOrigins: readonly string[];
}

const AgentRoute = {
  Agent: '/api/v1/agent',
  Instructions: '/api/v1/agent/instructions',
  Knowledge: '/api/v1/agent/knowledge',
  Automations: '/api/v1/agent/automations'
} as const;

const PathQuerySchema = z.object({ path: KnowledgeFilePathSchema });

/**
 * The cabinet's view of one agent. Every route runs behind the owner guard, so
 * a handler only ever sees the tenant it may act in, and a stranger's session
 * finds nothing rather than being told it exists.
 */
export function registerAgentRoutes(
  fastify: FastifyInstance,
  options: AgentHttpOptions
): void {
  const guard = new OwnerRequestGuard({
    accessTokens: options.accessTokens,
    allowedOrigins: options.allowedOrigins
  });

  fastify.get(
    AgentRoute.Agent,
    guard.read(async (_request, reply, owner) =>
      attempt(reply, async () => {
        const configuration = await options.service.read(owner.tenantId);

        return configuration === undefined
          ? notFound(reply)
          : reply.code(200).send(configuration);
      })
    )
  );

  fastify.post(
    AgentRoute.Agent,
    guard.mutate(async (_request, reply, owner) =>
      attempt(reply, async () => {
        const profile = await options.owners.findOwnerProfile({
          tenantId: owner.tenantId,
          userId: owner.userId
        });
        if (profile === undefined) {
          return notFound(reply);
        }

        const existing = await options.service.read(owner.tenantId);
        const configuration = await options.service.ensureAgent({
          tenantId: owner.tenantId,
          tenantName: profile.tenantName,
          userId: owner.userId
        });

        return reply.code(existing === undefined ? 201 : 200).send(configuration);
      })
    )
  );

  fastify.put(
    AgentRoute.Instructions,
    guard.mutate(async (request, reply, owner) =>
      attempt(reply, async () => {
        const body = AgentInstructionsUpdateSchema.safeParse(request.body);
        if (!body.success) {
          return invalidRequest(reply);
        }

        return reply.code(200).send(
          await options.service.updateInstructions({
            tenantId: owner.tenantId,
            userId: owner.userId,
            content: body.data.content
          })
        );
      })
    )
  );

  fastify.get(
    AgentRoute.Knowledge,
    guard.read(async (request, reply, owner) =>
      attempt(reply, async () => {
        const query = PathQuerySchema.safeParse(request.query);
        if (!query.success) {
          return invalidRequest(reply);
        }

        const file = await options.service.readFile({
          tenantId: owner.tenantId,
          path: query.data.path
        });

        return file === undefined ? notFound(reply) : reply.code(200).send(file);
      })
    )
  );

  fastify.put(
    AgentRoute.Knowledge,
    guard.mutate(async (request, reply, owner) =>
      attempt(reply, async () => {
        const body = KnowledgeFileUpsertSchema.safeParse(request.body);
        if (!body.success) {
          return invalidRequest(reply);
        }

        return reply.code(200).send(
          await options.service.upsertKnowledge({
            tenantId: owner.tenantId,
            userId: owner.userId,
            path: body.data.path,
            content: body.data.content
          })
        );
      })
    )
  );

  fastify.delete(
    AgentRoute.Knowledge,
    guard.mutate(async (request, reply, owner) =>
      attempt(reply, async () => {
        const query = PathQuerySchema.safeParse(request.query);
        if (!query.success) {
          return invalidRequest(reply);
        }

        const removed = await options.service.deleteKnowledge({
          tenantId: owner.tenantId,
          userId: owner.userId,
          path: query.data.path
        });

        return removed ? reply.code(204).send() : notFound(reply);
      })
    )
  );

  fastify.put(
    AgentRoute.Automations,
    guard.mutate(async (request, reply, owner) =>
      attempt(reply, async () => {
        const body = AutomationAllowlistUpdateSchema.safeParse(request.body);
        if (!body.success) {
          return invalidRequest(reply);
        }

        return reply.code(200).send(
          await options.service.updateAutomations({
            tenantId: owner.tenantId,
            userId: owner.userId,
            presets: body.data.presets
          })
        );
      })
    )
  );
}

/**
 * A tenant without an agent is a 404, a body the contracts refuse is a 400,
 * and anything else is ours to fix, not the caller's to read.
 */
async function attempt(
  reply: FastifyReply,
  operation: () => Promise<unknown>
): Promise<unknown> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AgentNotConfiguredError) {
      return notFound(reply);
    }
    if (error instanceof z.ZodError) {
      return invalidRequest(reply);
    }

    return internalFailure(reply, 'agent configuration failed', error);
  }
}
