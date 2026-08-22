import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  CapabilityAutomationNotFoundError,
  type CapabilityAutomationService
} from '../../modules/automation/application/capability-automation-service.js';
import type { OwnerAccessTokenService } from '../../modules/tenancy/application/owner-access-token.js';
import { OwnerRequestGuard } from './owner-request-guard.js';
import { internalFailure, invalidRequest, notFound } from './problems.js';

export interface AutomationHttpOptions {
  readonly service: CapabilityAutomationService;
  readonly accessTokens: OwnerAccessTokenService;
  readonly allowedOrigins: readonly string[];
}

const AutomationRoute = {
  Pending: '/api/v1/automations/pending',
  Approve: '/api/v1/automations/:id/approve',
  Reject: '/api/v1/automations/:id/reject'
} as const;

const RequestIdParamsSchema = z.strictObject({ id: z.uuidv7() });

/** What the owner's approval card is allowed to see: the calendar slot this
 * booking would create, never anything beyond it. This is the approval-card
 * content, not the audit trail — see `capability-automation-service.ts` for
 * why the compliance audit (`ToolCallTraceRecorder`) never carries this. */
const PendingAutomationDtoSchema = z.strictObject({
  id: z.uuidv7(),
  guestRef: z.string(),
  summary: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  createdAt: z.string()
});

const DecidedAutomationDtoSchema = z.strictObject({
  id: z.uuidv7(),
  status: z.enum(['pending_approval', 'approved', 'rejected', 'executing', 'executed', 'failed'])
});

/**
 * The owner's approval queue for personal automation: list what is waiting,
 * approve or reject it. Nothing here ever reaches Calendar or Sheets on its
 * own — approving is the only path into `CapabilityAutomationService.approve`,
 * which is where the McpPort write actually happens.
 */
export function registerAutomationRoutes(
  fastify: FastifyInstance,
  options: AutomationHttpOptions
): void {
  const guard = new OwnerRequestGuard({
    accessTokens: options.accessTokens,
    allowedOrigins: options.allowedOrigins
  });

  fastify.get(
    AutomationRoute.Pending,
    guard.read(async (_request, reply, owner) =>
      attempt(reply, async () => {
        const pending = await options.service.listPending(owner.tenantId);

        return reply.code(200).send(
          pending.map((request) =>
            PendingAutomationDtoSchema.parse({
              id: request.id,
              guestRef: request.guestRef,
              summary: request.calendarInput.summary,
              startsAt: request.calendarInput.startsAt,
              endsAt: request.calendarInput.endsAt,
              createdAt: request.createdAt
            })
          )
        );
      })
    )
  );

  fastify.post(
    AutomationRoute.Approve,
    guard.mutate(async (request, reply, owner) =>
      attempt(reply, async () => {
        const params = RequestIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return invalidRequest(reply);
        }

        const decided = await options.service.approve(owner.tenantId, params.data.id, owner.userId);

        return reply
          .code(200)
          .send(DecidedAutomationDtoSchema.parse({ id: decided.id, status: decided.status }));
      })
    )
  );

  fastify.post(
    AutomationRoute.Reject,
    guard.mutate(async (request, reply, owner) =>
      attempt(reply, async () => {
        const params = RequestIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return invalidRequest(reply);
        }

        const decided = await options.service.reject(owner.tenantId, params.data.id, owner.userId);

        return reply
          .code(200)
          .send(DecidedAutomationDtoSchema.parse({ id: decided.id, status: decided.status }));
      })
    )
  );
}

async function attempt(
  reply: FastifyReply,
  operation: () => Promise<unknown>
): Promise<unknown> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof CapabilityAutomationNotFoundError) {
      return notFound(reply);
    }
    if (error instanceof z.ZodError) {
      return invalidRequest(reply);
    }

    return internalFailure(reply, 'automation request failed', error);
  }
}
