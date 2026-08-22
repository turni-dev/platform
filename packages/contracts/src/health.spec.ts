import { describe, expect, it } from 'vitest';
import { HealthStatusSchema, ReadinessStatusSchema } from './health.js';

describe('HealthStatusSchema', () => {
  it('accepts the backend health payload', () => {
    expect(
      HealthStatusSchema.parse({
        status: 'ok',
        service: 'turni-backend'
      })
    ).toEqual({
      status: 'ok',
      service: 'turni-backend'
    });
  });

  it('rejects an unknown service name', () => {
    expect(() =>
      HealthStatusSchema.parse({
        status: 'ok',
        service: 'other'
      })
    ).toThrow();
  });
});

describe('ReadinessStatusSchema', () => {
  it('accepts the backend readiness payload with a database check', () => {
    expect(
      ReadinessStatusSchema.parse({
        status: 'ok',
        service: 'turni-backend',
        checks: { database: 'ok' }
      })
    ).toEqual({
      status: 'ok',
      service: 'turni-backend',
      checks: { database: 'ok' }
    });
  });

  it('rejects a missing checks object', () => {
    expect(() =>
      ReadinessStatusSchema.parse({
        status: 'ok',
        service: 'turni-backend'
      })
    ).toThrow();
  });
});
