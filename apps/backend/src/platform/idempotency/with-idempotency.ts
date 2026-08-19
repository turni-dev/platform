import { createHash } from 'node:crypto';
import type { FastifyReply } from 'fastify';
import { conflict } from '../../entrypoints/http/problems.js';
import type { IdempotencyKeyRepositoryPort } from './idempotency-key-repository.port.js';

export interface WithIdempotencyInput {
  readonly repository: IdempotencyKeyRepositoryPort;
  readonly tenantId: string;
  /** The `Idempotency-Key` request header. Its absence is not an error. */
  readonly key: string | undefined;
  /** The parsed, already-validated request body, hashed for reuse detection. */
  readonly request: unknown;
  readonly reply: FastifyReply;
  readonly ttlSeconds: number;
  /** Executes the real handler. Returns what would be sent; never sends it. */
  readonly run: () => Promise<{ statusCode: number; body: unknown }>;
}

/**
 * An opt-in wrapper a mutate handler calls explicitly — not a global Fastify
 * hook — matching this repo's preference for explicit composition, the same
 * way `guard.mutate` is a function a route calls rather than an `onRequest`
 * that runs for everyone. Sends the reply itself in every branch.
 */
export async function withIdempotency(input: WithIdempotencyInput): Promise<unknown> {
  const { repository, tenantId, key, request, reply, ttlSeconds, run } = input;

  if (key === undefined) {
    const result = await run();

    return reply.code(result.statusCode).send(result.body);
  }

  const requestHash = canonicalHash(request);
  const existing = await repository.find({ tenantId, key });

  if (existing === undefined) {
    const result = await run();
    await repository.store({
      tenantId,
      key,
      requestHash,
      statusCode: result.statusCode,
      response: result.body,
      ttlSeconds
    });

    return reply.code(result.statusCode).send(result.body);
  }

  if (existing.requestHash !== requestHash) {
    return conflict(reply);
  }

  return reply.code(existing.statusCode).send(existing.response);
}

/** A stable hash across key order, so the same body always hashes the same. */
function canonicalHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([entryKey, entryValue]) => `${JSON.stringify(entryKey)}:${canonicalJson(entryValue)}`);

    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}
