import { describe, expect, it } from 'vitest';
import { readBackendOrigin } from '../backend-origin';

describe('readBackendOrigin', () => {
  it('falls back to the local backend during development', () => {
    expect(readBackendOrigin({})).toBe('http://localhost:3000');
  });

  it('uses the configured origin without its trailing slash', () => {
    expect(readBackendOrigin({ BACKEND_ORIGIN: 'https://api.turni.ru/' })).toBe(
      'https://api.turni.ru'
    );
  });

  it('refuses a value that is not an absolute origin', () => {
    expect(() => readBackendOrigin({ BACKEND_ORIGIN: 'api.turni.ru' })).toThrow();
  });
});
