import { describe, expect, it, vi } from 'vitest';
import robots from '../robots';

describe('robots()', () => {
  it('allows crawling and points at the sitemap', () => {
    vi.stubEnv('SITE_URL', 'https://turni.example');

    const rules = robots();

    expect(rules).toEqual({
      rules: { userAgent: '*', allow: '/' },
      sitemap: 'https://turni.example/sitemap.xml'
    });

    vi.unstubAllEnvs();
  });

  it('falls back to a local origin when SITE_URL is not configured', () => {
    vi.stubEnv('SITE_URL', '');

    const rules = robots();

    expect(rules.sitemap).toBe('http://localhost:3002/sitemap.xml');

    vi.unstubAllEnvs();
  });
});
