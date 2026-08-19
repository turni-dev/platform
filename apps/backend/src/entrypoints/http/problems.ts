import { ProblemType } from '@turni/contracts';
import type { FastifyReply } from 'fastify';

/**
 * The one place HTTP refusals are shaped. Every problem is deliberately
 * generic: a body that explained itself would tell a stranger which guess was
 * close.
 */
export function invalidRequest(reply: FastifyReply): FastifyReply {
  return reply.code(400).send({
    type: ProblemType.InvalidRequest,
    title: 'Invalid request',
    status: 400
  });
}

export function unauthorized(reply: FastifyReply): FastifyReply {
  return reply.code(401).send({
    type: ProblemType.Unauthorized,
    title: 'Unauthorized',
    status: 401
  });
}

/** Used both for a missing thing and for another tenant's: a stranger learns
 * nothing about what exists. */
export function notFound(reply: FastifyReply): FastifyReply {
  return reply.code(404).send({
    type: ProblemType.InvalidRequest,
    title: 'Not found',
    status: 404
  });
}

export function rateLimited(
  reply: FastifyReply,
  retryAfterSeconds: number
): FastifyReply {
  return reply
    .header('retry-after', String(retryAfterSeconds))
    .code(429)
    .send({
      type: ProblemType.InvalidRequest,
      title: 'Too many requests',
      status: 429
    });
}

export function serviceUnavailable(reply: FastifyReply): FastifyReply {
  return reply.code(503).send({
    type: ProblemType.InvalidRequest,
    title: 'Service unavailable',
    status: 503
  });
}

export function forbidden(reply: FastifyReply): FastifyReply {
  return reply.code(403).send({
    type: ProblemType.Unauthorized,
    title: 'Forbidden',
    status: 403
  });
}

/** An `Idempotency-Key` reused for a request whose body no longer matches. */
export function conflict(reply: FastifyReply): FastifyReply {
  return reply.code(409).send({
    type: ProblemType.InvalidRequest,
    title: 'Conflict',
    status: 409
  });
}

/**
 * An error we do not model is ours, not the caller's. The caller sees nothing
 * but a generic failure; the cause goes to the operator's log.
 */
export function internalFailure(
  reply: FastifyReply,
  context: string,
  error: unknown
): FastifyReply {
  console.error(context, error);

  return reply.code(500).send({
    type: ProblemType.InvalidRequest,
    title: 'Internal error',
    status: 500
  });
}
