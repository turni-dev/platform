import { describe, expect, it } from 'vitest';
import { readCmsEnv } from '../cms-env';

describe('readCmsEnv', () => {
  it('parses read and write tokens as distinct optional values', () => {
    const env = readCmsEnv({
      CMS_BASE_URL: 'http://cms:1337',
      CMS_READ_TOKEN: 'read-token',
      CMS_WRITE_TOKEN: 'write-token'
    });

    expect(env).toMatchObject({
      CMS_BASE_URL: 'http://cms:1337',
      CMS_READ_TOKEN: 'read-token',
      CMS_WRITE_TOKEN: 'write-token'
    });
  });

  it('allows an empty environment so local dev falls back to seed content', () => {
    const env = readCmsEnv({});

    expect(env.CMS_BASE_URL).toBeUndefined();
    expect(env.CMS_READ_TOKEN).toBeUndefined();
    expect(env.CMS_WRITE_TOKEN).toBeUndefined();
  });

  it('treats a blank token the same as an unset one, matching the compose ${VAR:-} default', () => {
    const env = readCmsEnv({ CMS_READ_TOKEN: '   ' });

    expect(env.CMS_READ_TOKEN).toBeUndefined();
  });

  it('rejects a base url that is set but not a valid url', () => {
    expect(() => readCmsEnv({ CMS_BASE_URL: 'not-a-url' })).toThrow();
  });

  it('never lets the read and write token collapse into the same variable name', () => {
    const env = readCmsEnv({ CMS_READ_TOKEN: 'read-token', CMS_WRITE_TOKEN: 'write-token' });

    expect(env.CMS_READ_TOKEN).not.toBe(env.CMS_WRITE_TOKEN);
  });
});
