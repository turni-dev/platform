import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  registerProblemErrorHandler,
  registerProblemNotFoundHandler
} from '../problem-error-handler.js';

function buildApp(): FastifyInstance {
  const app: FastifyInstance = Fastify({ logger: false });
  registerProblemErrorHandler(app);
  registerProblemNotFoundHandler(app);

  app.get('/boom', () => {
    throw new Error('unexpected failure');
  });
  app.get('/zod-boom', () => {
    z.object({ email: z.string() }).parse({});
  });

  return app;
}

describe('registerProblemErrorHandler', () => {
  it('answers an unknown route with an RFC 7807 404', async () => {
    const app = buildApp();
    try {
      const response = await app.inject({ method: 'GET', url: '/does-not-exist' });
      expect(response.statusCode).toBe(404);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.json()).toMatchObject({ status: 404, title: 'Not found' });
    } finally {
      await app.close();
    }
  });

  it('maps an uncaught error to an RFC 7807 500 without leaking the cause', async () => {
    const app = buildApp();
    try {
      const response = await app.inject({ method: 'GET', url: '/boom' });
      expect(response.statusCode).toBe(500);
      expect(response.headers['content-type']).toContain('application/problem+json');
      const body = response.json<Record<string, unknown>>();
      expect(body).toMatchObject({ status: 500, title: 'Internal error' });
      expect(JSON.stringify(body)).not.toContain('unexpected failure');
    } finally {
      await app.close();
    }
  });

  it('maps an uncaught ZodError to an RFC 7807 400', async () => {
    const app = buildApp();
    try {
      const response = await app.inject({ method: 'GET', url: '/zod-boom' });
      expect(response.statusCode).toBe(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.json()).toMatchObject({ status: 400, title: 'Invalid request' });
    } finally {
      await app.close();
    }
  });
});
