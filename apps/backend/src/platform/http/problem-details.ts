import type { ProblemDetails } from '@turni/contracts';
import type { FastifyReply } from 'fastify';

/** The RFC 7807 media type every problem response is sent with. */
export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

export interface SendProblemInput {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  /** Omit when explaining the failure would leak information to a stranger
   * (e.g. which guess about a tenant's data was close). */
  readonly detail?: string;
  /** The request path the problem occurred on, when known. */
  readonly instance?: string;
}

/**
 * The one place an RFC 7807 body is shaped and sent, so every module's error
 * surface is byte-for-byte the same shape and media type. Callers in
 * `entrypoints/http/problems.ts` build the per-status helpers on top of this.
 */
export function sendProblem(reply: FastifyReply, problem: SendProblemInput): FastifyReply {
  const body: ProblemDetails = {
    type: problem.type,
    title: problem.title,
    status: problem.status,
    ...(problem.detail !== undefined ? { detail: problem.detail } : {}),
    ...(problem.instance !== undefined ? { instance: problem.instance } : {})
  };

  return reply.header('content-type', PROBLEM_CONTENT_TYPE).code(problem.status).send(body);
}
