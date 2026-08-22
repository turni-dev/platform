import type { FastifyReply } from 'fastify';
import { describe, expect, it } from 'vitest';
import { PROBLEM_CONTENT_TYPE, sendProblem } from '../problem-details.js';

class FakeReply {
  public statusCode: number | undefined;
  public body: unknown;
  public readonly headers = new Map<string, string>();

  public header(name: string, value: string): this {
    this.headers.set(name, value);

    return this;
  }

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

describe('sendProblem', () => {
  it('sends application/problem+json with the RFC 7807 required fields', () => {
    const reply = fakeReply();

    sendProblem(reply as unknown as FastifyReply, {
      type: 'https://turni.ru/problems/invalid-request',
      title: 'Invalid request',
      status: 400
    });

    expect(reply.headers.get('content-type')).toBe(PROBLEM_CONTENT_TYPE);
    expect(reply.statusCode).toBe(400);
    expect(reply.body).toEqual({
      type: 'https://turni.ru/problems/invalid-request',
      title: 'Invalid request',
      status: 400
    });
  });

  it('includes detail and instance only when supplied', () => {
    const reply = fakeReply();

    sendProblem(reply as unknown as FastifyReply, {
      type: 'https://turni.ru/problems/invalid-request',
      title: 'Invalid request',
      status: 400,
      detail: 'The "email" field is required.',
      instance: '/api/v1/owner/auth/request'
    });

    expect(reply.body).toEqual({
      type: 'https://turni.ru/problems/invalid-request',
      title: 'Invalid request',
      status: 400,
      detail: 'The "email" field is required.',
      instance: '/api/v1/owner/auth/request'
    });
  });

  it('omits detail and instance keys entirely when absent, not as undefined', () => {
    const reply = fakeReply();

    sendProblem(reply as unknown as FastifyReply, {
      type: 'https://turni.ru/problems/unauthorized',
      title: 'Unauthorized',
      status: 401
    });

    expect(Object.keys(reply.body as object)).toEqual(['type', 'title', 'status']);
  });
});
