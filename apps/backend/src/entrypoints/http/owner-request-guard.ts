import type { OwnerRole } from '@turni/contracts';
import type { FastifyReply, FastifyRequest, RouteHandlerMethod } from 'fastify';
import type { OwnerAccessTokenService } from '../../modules/tenancy/application/owner-access-token.js';
import { AuthCookieName, isTrustedOrigin, readCookie } from './auth-cookies.js';
import { forbidden, unauthorized } from './problems.js';

export interface AuthenticatedOwner {
  readonly userId: string;
  readonly tenantId: string;
  readonly sessionId: string;
  readonly role: typeof OwnerRole;
}

export interface OwnerRequestGuardOptions {
  readonly accessTokens: OwnerAccessTokenService;
  readonly allowedOrigins: readonly string[];
}

export type OwnerRouteHandler = (
  request: FastifyRequest,
  reply: FastifyReply,
  owner: AuthenticatedOwner
) => Promise<unknown>;

/**
 * The single entrance to the cabinet API. A handler wrapped here can only be
 * reached by a request that carries a verified owner session, so no route has
 * to remember to check one. Mutations additionally need a trusted browser
 * origin, checked before the session so a cross-site attempt never even
 * exercises the token path.
 */
export class OwnerRequestGuard {
  public constructor(private readonly options: OwnerRequestGuardOptions) {}

  /** Wraps a read: session required, origin irrelevant. */
  public read(handler: OwnerRouteHandler): RouteHandlerMethod {
    return async (request, reply) => this.run(request, reply, handler);
  }

  /** Wraps a cookie-authenticated mutation: trusted origin, then session. */
  public mutate(handler: OwnerRouteHandler): RouteHandlerMethod {
    return async (request, reply) => {
      if (!this.trusted(request)) {
        return forbidden(reply);
      }

      return this.run(request, reply, handler);
    };
  }

  /** Resolves the owner behind a request, or nothing when there is none. */
  public authenticate(request: FastifyRequest): AuthenticatedOwner | undefined {
    const presented = readCookie(request.headers.cookie, AuthCookieName.Access);
    if (presented === undefined) {
      return undefined;
    }

    try {
      const claims = this.options.accessTokens.verify(presented);

      return {
        userId: claims.userId,
        tenantId: claims.tenantId,
        sessionId: claims.sessionId,
        role: claims.role
      };
    } catch {
      // Forged, malformed and expired tokens are the same answer: no session.
      return undefined;
    }
  }

  /** Fails closed: a mutation without a recognizable browser origin is refused. */
  public trusted(request: FastifyRequest): boolean {
    return isTrustedOrigin({
      origin: request.headers.origin,
      referer: request.headers.referer,
      allowedOrigins: this.options.allowedOrigins
    });
  }

  private async run(
    request: FastifyRequest,
    reply: FastifyReply,
    handler: OwnerRouteHandler
  ): Promise<unknown> {
    const owner = this.authenticate(request);

    return owner === undefined ? unauthorized(reply) : handler(request, reply, owner);
  }
}
