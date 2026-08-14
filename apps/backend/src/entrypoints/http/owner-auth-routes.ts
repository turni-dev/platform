import {
  OwnerAuthRequestSchema,
  OwnerAuthVerifyRequestSchema,
  OwnerIdentitySchema,
  ProblemType,
  type OwnerIdentity
} from '@turni/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  OwnerAuthError,
  OwnerAuthErrorCode,
  type OwnerAuthService
} from '../../modules/tenancy/application/owner-auth-service.js';
import type {
  OwnerAccessTokenService,
  VerifiedOwnerAccess
} from '../../modules/tenancy/application/owner-access-token.js';
import type { OwnerRegistrationRepositoryPort } from '../../modules/tenancy/application/owner-registration-repository.port.js';
import type { OwnerSessionService } from '../../modules/tenancy/application/owner-session.js';
import {
  authCookieOptions,
  AuthCookieName,
  clearedAuthCookies,
  issuedAuthCookies,
  isTrustedOrigin,
  readCookie
} from './auth-cookies.js';

export interface OwnerAuthHttpOptions {
  readonly service: OwnerAuthService;
  readonly sessions: OwnerSessionService;
  readonly accessTokens: OwnerAccessTokenService;
  readonly owners: Pick<OwnerRegistrationRepositoryPort, 'findOwnerProfile'>;
  /** Off only for local HTTP development; production always serves over TLS. */
  readonly secureCookies: boolean;
  readonly allowedOrigins: readonly string[];
}

const OwnerAuthRoute = {
  RegisterRequest: '/api/v1/auth/register/request',
  RegisterVerify: '/api/v1/auth/register/verify',
  LoginRequest: '/api/v1/auth/login/request',
  LoginVerify: '/api/v1/auth/login/verify',
  Refresh: '/api/v1/auth/refresh',
  Logout: '/api/v1/auth/logout',
  Me: '/api/v1/auth/me'
} as const;

/**
 * Registration and login share one handler pair on purpose: an answer that
 * differed between them would tell a stranger whether an email is registered.
 */
export function registerOwnerAuthRoutes(
  fastify: FastifyInstance,
  options: OwnerAuthHttpOptions
): void {
  const cookies = authCookieOptions({ secure: options.secureCookies });

  const requestCode = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const parsed = OwnerAuthRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return invalidRequest(reply);
    }

    try {
      const challenge = await options.service.requestCode({
        email: parsed.data.email,
        ip: request.ip,
        now: new Date()
      });

      return reply.code(202).send(challenge);
    } catch (error) {
      return authFailure(reply, error);
    }
  };

  const verifyCode = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const parsed = OwnerAuthVerifyRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return invalidRequest(reply);
    }

    const userAgent = request.headers['user-agent'];
    try {
      const verified = await options.service.verifyCode({
        email: parsed.data.email,
        code: parsed.data.code,
        ip: request.ip,
        ...(userAgent === undefined ? {} : { userAgent }),
        now: new Date()
      });

      return sendCookies(reply, issuedAuthCookies(verified.session, cookies))
        .code(200)
        .send(OwnerIdentitySchema.parse(verified.identity));
    } catch (error) {
      return authFailure(reply, error);
    }
  };

  for (const route of [OwnerAuthRoute.RegisterRequest, OwnerAuthRoute.LoginRequest]) {
    fastify.post(route, requestCode);
  }
  for (const route of [OwnerAuthRoute.RegisterVerify, OwnerAuthRoute.LoginVerify]) {
    fastify.post(route, verifyCode);
  }

  fastify.post(OwnerAuthRoute.Refresh, async (request, reply) => {
    if (!trusted(request, options.allowedOrigins)) {
      return forbidden(reply);
    }

    const presented = readCookie(request.headers.cookie, AuthCookieName.Refresh);
    if (presented === undefined) {
      return unauthorized(sendCookies(reply, clearedAuthCookies(cookies)));
    }

    try {
      const session = await options.sessions.refresh(presented);

      return sendCookies(reply, issuedAuthCookies(session, cookies)).code(204).send();
    } catch {
      return unauthorized(sendCookies(reply, clearedAuthCookies(cookies)));
    }
  });

  fastify.post(OwnerAuthRoute.Logout, async (request, reply) => {
    if (!trusted(request, options.allowedOrigins)) {
      return forbidden(reply);
    }

    const presented = readCookie(request.headers.cookie, AuthCookieName.Refresh);
    if (presented !== undefined) {
      // A credential the service cannot close is already worthless; cookies still go.
      await options.service.signOut(presented, new Date());
    }

    return sendCookies(reply, clearedAuthCookies(cookies)).code(204).send();
  });

  fastify.get(OwnerAuthRoute.Me, async (request, reply) => {
    const identity = await resolveIdentity(request, options);

    return identity === undefined ? unauthorized(reply) : reply.code(200).send(identity);
  });
}

async function resolveIdentity(
  request: FastifyRequest,
  options: OwnerAuthHttpOptions
): Promise<OwnerIdentity | undefined> {
  const presented = readCookie(request.headers.cookie, AuthCookieName.Access);
  if (presented === undefined) {
    return undefined;
  }

  const claims = verifiedClaims(options.accessTokens, presented);
  if (claims === undefined) {
    return undefined;
  }

  const profile = await options.owners.findOwnerProfile({
    tenantId: claims.tenantId,
    userId: claims.userId
  });

  return profile === undefined
    ? undefined
    : OwnerIdentitySchema.parse({ ...profile, role: claims.role });
}

function verifiedClaims(
  accessTokens: OwnerAccessTokenService,
  token: string
): VerifiedOwnerAccess | undefined {
  try {
    return accessTokens.verify(token);
  } catch {
    return undefined;
  }
}

function trusted(request: FastifyRequest, allowedOrigins: readonly string[]): boolean {
  return isTrustedOrigin({
    origin: request.headers.origin,
    referer: request.headers.referer,
    allowedOrigins
  });
}

function sendCookies(reply: FastifyReply, cookies: readonly string[]): FastifyReply {
  return reply.header('set-cookie', [...cookies]);
}

function authFailure(reply: FastifyReply, error: unknown): FastifyReply {
  if (!(error instanceof OwnerAuthError)) {
    return internalFailure(reply, error);
  }

  if (error.code === OwnerAuthErrorCode.RateLimited) {
    return reply
      .header('retry-after', String(error.retryAfterSeconds ?? 60))
      .code(429)
      .send({
        type: ProblemType.InvalidRequest,
        title: 'Too many requests',
        status: 429
      });
  }

  if (error.code === OwnerAuthErrorCode.DeliveryFailed) {
    return reply.code(503).send({
      type: ProblemType.InvalidRequest,
      title: 'Service unavailable',
      status: 503
    });
  }

  return unauthorized(reply);
}

/**
 * An error the auth flow does not model is ours, not the caller's. The caller
 * sees nothing but a generic failure; the cause goes to the operator's log.
 */
function internalFailure(reply: FastifyReply, error: unknown): FastifyReply {
  console.error('owner auth failed', error);

  return reply.code(500).send({
    type: ProblemType.InvalidRequest,
    title: 'Internal error',
    status: 500
  });
}

function invalidRequest(reply: FastifyReply): FastifyReply {
  return reply.code(400).send({
    type: ProblemType.InvalidRequest,
    title: 'Invalid request',
    status: 400
  });
}

function unauthorized(reply: FastifyReply): FastifyReply {
  return reply.code(401).send({
    type: ProblemType.Unauthorized,
    title: 'Unauthorized',
    status: 401
  });
}

function forbidden(reply: FastifyReply): FastifyReply {
  return reply.code(403).send({
    type: ProblemType.Unauthorized,
    title: 'Forbidden',
    status: 403
  });
}
