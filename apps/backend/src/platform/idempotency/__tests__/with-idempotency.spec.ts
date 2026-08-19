import type { FastifyReply } from 'fastify';
import { describe, expect, it } from 'vitest';
import type {
  IdempotencyKeyFound,
  IdempotencyKeyRepositoryPort,
  StoreIdempotencyKeyInput
} from '../idempotency-key-repository.port.js';
import { withIdempotency } from '../with-idempotency.js';

const tenantId = '01900000-0000-7000-8000-000000000001';

class FakeRepository implements IdempotencyKeyRepositoryPort {
  public readonly rows = new Map<string, IdempotencyKeyFound>();
  public storeCalls = 0;

  public find(
    input: Readonly<{ tenantId: string; key: string }>
  ): Promise<IdempotencyKeyFound | undefined> {
    return Promise.resolve(this.rows.get(`${input.tenantId}:${input.key}`));
  }

  public store(input: StoreIdempotencyKeyInput): Promise<void> {
    this.storeCalls += 1;
    const existingKey = `${input.tenantId}:${input.key}`;
    if (!this.rows.has(existingKey)) {
      this.rows.set(existingKey, {
        requestHash: input.requestHash,
        statusCode: input.statusCode,
        response: input.response
      });
    }

    return Promise.resolve();
  }
}

class FakeReply {
  public statusCode: number | undefined;
  public body: unknown;

  public code(statusCode: number): this {
    this.statusCode = statusCode;

    return this;
  }

  public send(body: unknown): this {
    this.body = body;

    return this;
  }
}

function fakeReply(): FakeReply {
  return new FakeReply();
}

describe('withIdempotency', () => {
  it('runs once and never stores when no key header is present', async () => {
    const repository = new FakeRepository();
    let runs = 0;
    const reply = fakeReply();

    await withIdempotency({
      repository,
      tenantId,
      key: undefined,
      request: { accessKey: 'a', groupId: 1 },
      reply: reply as unknown as FastifyReply,
      ttlSeconds: 86_400,
      run: () => {
        runs += 1;

        return Promise.resolve({ statusCode: 201, body: { id: 'connection-1' } });
      }
    });

    expect(runs).toBe(1);
    expect(repository.storeCalls).toBe(0);
    expect(reply.statusCode).toBe(201);
    expect(reply.body).toEqual({ id: 'connection-1' });
  });

  it('runs once and stores on the first call with a key', async () => {
    const repository = new FakeRepository();
    let runs = 0;
    const reply = fakeReply();

    await withIdempotency({
      repository,
      tenantId,
      key: 'idem-1',
      request: { accessKey: 'a', groupId: 1 },
      reply: reply as unknown as FastifyReply,
      ttlSeconds: 86_400,
      run: () => {
        runs += 1;

        return Promise.resolve({ statusCode: 201, body: { id: 'connection-1' } });
      }
    });

    expect(runs).toBe(1);
    expect(repository.storeCalls).toBe(1);
    expect(reply.statusCode).toBe(201);
    expect(reply.body).toEqual({ id: 'connection-1' });
  });

  it('replays the stored result on a repeat with the same body, without re-running', async () => {
    const repository = new FakeRepository();
    let runs = 0;
    const run = (): Promise<{ statusCode: number; body: unknown }> => {
      runs += 1;

      return Promise.resolve({ statusCode: 201, body: { id: 'connection-1' } });
    };
    const request = { accessKey: 'a', groupId: 1 };

    await withIdempotency({
      repository,
      tenantId,
      key: 'idem-1',
      request,
      reply: fakeReply() as unknown as FastifyReply,
      ttlSeconds: 86_400,
      run
    });

    const secondReply = fakeReply();
    await withIdempotency({
      repository,
      tenantId,
      key: 'idem-1',
      request,
      reply: secondReply as unknown as FastifyReply,
      ttlSeconds: 86_400,
      run
    });

    expect(runs).toBe(1);
    expect(repository.storeCalls).toBe(1);
    expect(secondReply.statusCode).toBe(201);
    expect(secondReply.body).toEqual({ id: 'connection-1' });
  });

  it('refuses a reused key with a different body, without re-running or overwriting', async () => {
    const repository = new FakeRepository();
    let runs = 0;
    const run = (): Promise<{ statusCode: number; body: unknown }> => {
      runs += 1;

      return Promise.resolve({ statusCode: 201, body: { id: `connection-${runs}` } });
    };

    await withIdempotency({
      repository,
      tenantId,
      key: 'idem-1',
      request: { accessKey: 'a', groupId: 1 },
      reply: fakeReply() as unknown as FastifyReply,
      ttlSeconds: 86_400,
      run
    });

    const conflictReply = fakeReply();
    await withIdempotency({
      repository,
      tenantId,
      key: 'idem-1',
      request: { accessKey: 'a', groupId: 2 },
      reply: conflictReply as unknown as FastifyReply,
      ttlSeconds: 86_400,
      run
    });

    expect(runs).toBe(1);
    expect(repository.storeCalls).toBe(1);
    expect(conflictReply.statusCode).toBe(409);
    expect(repository.rows.get(`${tenantId}:idem-1`)?.response).toEqual({
      id: 'connection-1'
    });
  });

  it('hashes the request the same way regardless of key order', async () => {
    const repository = new FakeRepository();
    let runs = 0;
    const run = (): Promise<{ statusCode: number; body: unknown }> => {
      runs += 1;

      return Promise.resolve({ statusCode: 201, body: { id: 'connection-1' } });
    };

    await withIdempotency({
      repository,
      tenantId,
      key: 'idem-1',
      request: { accessKey: 'a', groupId: 1 },
      reply: fakeReply() as unknown as FastifyReply,
      ttlSeconds: 86_400,
      run
    });

    const reordered = fakeReply();
    await withIdempotency({
      repository,
      tenantId,
      key: 'idem-1',
      request: { groupId: 1, accessKey: 'a' },
      reply: reordered as unknown as FastifyReply,
      ttlSeconds: 86_400,
      run
    });

    expect(runs).toBe(1);
    expect(reordered.statusCode).toBe(201);
  });
});
