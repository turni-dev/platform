import { afterEach, describe, expect, it, vi } from 'vitest';
import { readHttpEnv } from './env.js';

describe('readHttpEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses safe HTTP defaults when variables are absent', () => {
    vi.stubEnv('HTTP_HOST', '');
    vi.stubEnv('HTTP_PORT', '');

    delete process.env['HTTP_HOST'];
    delete process.env['HTTP_PORT'];

    expect(readHttpEnv()).toEqual({
      HTTP_HOST: '0.0.0.0',
      HTTP_PORT: 3000
    });
  });

  it('coerces a valid explicit port', () => {
    expect(
      readHttpEnv({
        HTTP_HOST: '127.0.0.1',
        HTTP_PORT: '8080'
      })
    ).toEqual({
      HTTP_HOST: '127.0.0.1',
      HTTP_PORT: 8080
    });
  });

  it('rejects an out-of-range port', () => {
    expect(() =>
      readHttpEnv({
        HTTP_PORT: '65536'
      })
    ).toThrow();
  });
});
