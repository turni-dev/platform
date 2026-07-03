import { HealthStatusSchema } from '@turni/contracts';
import { describe, expect, it } from 'vitest';
import { createHttpApp } from './app.js';

describe('HTTP entrypoint health checks', () => {
  it('returns a contract-valid health payload', async () => {
    const app = await createHttpApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/healthz'
      });

      expect(response.statusCode).toBe(200);
      expect(HealthStatusSchema.parse(response.json())).toEqual({
        status: 'ok',
        service: 'turni-backend'
      });
    } finally {
      await app.close();
    }
  }, 10_000);
});
