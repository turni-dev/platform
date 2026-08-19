import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  GoogleAgentMissingError,
  GoogleConnectionMissingError,
  GoogleConnectionNotPendingError,
  type GoogleConnectionService
} from '../../modules/integrations/google/application/google-connection-service.js';
import {
  GoogleConnectionStatusSchema,
  type GoogleConnectionRepositoryPort,
  type GoogleConnectionSummary
} from '../../modules/integrations/google/application/google-connection-repository.port.js';
import type { OwnerAccessTokenService } from '../../modules/tenancy/application/owner-access-token.js';
import { OwnerRequestGuard } from './owner-request-guard.js';
import { forbidden, internalFailure, invalidRequest, notFound } from './problems.js';

export interface GoogleIntegrationHttpOptions {
  readonly service: GoogleConnectionService;
  readonly connections: GoogleConnectionRepositoryPort;
  readonly accessTokens: OwnerAccessTokenService;
  readonly allowedOrigins: readonly string[];
  /** Where the callback sends the owner's browser once consent is recorded;
   * the cabinet page there immediately calls `.../resources` under the
   * normal guard to finish activation with a session, not a URL param. */
  readonly cabinetRedirectUrl: string;
}

const GoogleIntegrationRoute = {
  Summary: '/api/v1/integrations/google',
  Consent: '/api/v1/integrations/google/consent',
  Callback: '/api/v1/integrations/google/callback',
  Resources: '/api/v1/integrations/google/resources'
} as const;

const CallbackQuerySchema = z.strictObject({
  code: z.string().trim().min(1),
  state: z.string().trim().min(1)
});

const ResourcesBodySchema = z.strictObject({
  calendarId: z.string().trim().min(1),
  spreadsheetId: z.string().trim().min(1)
});

/** What the cabinet is allowed to see about a connection. Built field by
 * field — never a spread of the repository's summary — so a future field
 * added to `GoogleConnectionSummary` cannot silently reach an HTTP response
 * without a deliberate change here. */
const GoogleConnectionSummaryDtoSchema = z.strictObject({
  id: z.uuidv7(),
  status: GoogleConnectionStatusSchema,
  googleAccountEmail: z.string().min(1),
  calendarId: z.string().min(1).optional(),
  spreadsheetId: z.string().min(1).optional()
});

/**
 * The cabinet's view of the tenant's Google connection: whether one exists,
 * the wizard that starts and finishes consent, and the resource picker that
 * activates it. Every route runs behind the owner guard except the OAuth
 * callback, which cannot carry a custom Origin header — it is a top-level
 * navigation Google makes on the browser's behalf — and instead trusts
 * nothing but the signed `state` it was handed at the start of the wizard,
 * the same reasoning `vk-webhook-routes.ts` applies to a routing key.
 */
export function registerGoogleIntegrationRoutes(
  fastify: FastifyInstance,
  options: GoogleIntegrationHttpOptions
): void {
  const guard = new OwnerRequestGuard({
    accessTokens: options.accessTokens,
    allowedOrigins: options.allowedOrigins
  });

  fastify.get(
    GoogleIntegrationRoute.Summary,
    guard.read(async (_request, reply, owner) =>
      attempt(reply, async () => {
        const summary = await options.connections.findByTenant(owner.tenantId);

        return reply
          .code(200)
          .send(summary === undefined ? { status: 'disconnected' as const } : toDto(summary));
      })
    )
  );

  fastify.post(
    GoogleIntegrationRoute.Consent,
    guard.mutate(async (_request, reply, owner) =>
      attempt(reply, async () =>
        reply.code(200).send(
          await options.service.startConsent({
            tenantId: owner.tenantId,
            userId: owner.userId
          })
        )
      )
    )
  );

  fastify.get(GoogleIntegrationRoute.Callback, async (request, reply) => {
    const query = CallbackQuerySchema.safeParse(request.query);
    if (!query.success) {
      return forbidden(reply);
    }

    try {
      await options.service.completeConsent({
        code: query.data.code,
        state: query.data.state
      });

      return reply.redirect(options.cabinetRedirectUrl, 302);
    } catch (error) {
      if (error instanceof GoogleAgentMissingError) {
        return notFound(reply);
      }

      // A forged, replayed or expired state, or a failed exchange with
      // Google itself: none of that is a detail worth exposing to a request
      // that carries no session at all — refuse the same way a bad webhook
      // routing key is refused.
      return forbidden(reply);
    }
  });

  fastify.post(
    GoogleIntegrationRoute.Resources,
    guard.mutate(async (request, reply, owner) =>
      attempt(reply, async () => {
        const body = ResourcesBodySchema.safeParse(request.body);
        if (!body.success) {
          return invalidRequest(reply);
        }

        const pending = await options.connections.findByTenant(owner.tenantId);
        if (pending === undefined) {
          return notFound(reply);
        }

        const summary = await options.service.selectResources({
          tenantId: owner.tenantId,
          connectionId: pending.id,
          calendarId: body.data.calendarId,
          spreadsheetId: body.data.spreadsheetId
        });

        return reply.code(200).send(toDto(summary));
      })
    )
  );
}

function toDto(
  summary: GoogleConnectionSummary
): z.infer<typeof GoogleConnectionSummaryDtoSchema> {
  return GoogleConnectionSummaryDtoSchema.parse({
    id: summary.id,
    status: summary.status,
    googleAccountEmail: summary.googleAccountEmail,
    ...(summary.calendarId === undefined ? {} : { calendarId: summary.calendarId }),
    ...(summary.spreadsheetId === undefined ? {} : { spreadsheetId: summary.spreadsheetId })
  });
}

async function attempt(
  reply: FastifyReply,
  operation: () => Promise<unknown>
): Promise<unknown> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof GoogleConnectionNotPendingError) {
      return invalidRequest(reply);
    }
    if (error instanceof GoogleAgentMissingError) {
      return notFound(reply);
    }
    if (error instanceof GoogleConnectionMissingError) {
      return internalFailure(reply, 'google connection missing after activation', error);
    }
    if (error instanceof z.ZodError) {
      return invalidRequest(reply);
    }

    return internalFailure(reply, 'google integration request failed', error);
  }
}
