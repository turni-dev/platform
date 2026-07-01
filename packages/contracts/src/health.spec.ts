import { describe, expect, it } from 'vitest';
import { HealthStatusSchema } from './health.js';

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
