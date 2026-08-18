import { describe, expect, it, vi } from 'vitest';
import { createCmsSlugsSource, type SlugSource } from '../site-slugs-source';
import type { SiteFetch } from '../cms-page-source';
import { seedSlugs } from '../seed-page';

function respondWith(body: unknown, ok = true): SiteFetch {
  return vi.fn(() =>
    Promise.resolve({
      ok,
      status: ok ? 200 : 500,
      text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body))
    })
  );
}

function page(slugs: readonly string[], page_: number, pageCount: number): unknown {
  return {
    data: slugs.map((slug) => ({ slug })),
    meta: { pagination: { page: page_, pageCount } }
  };
}

describe('createCmsSlugsSource', () => {
  it('lists the slugs the editor published', async () => {
    const source: SlugSource = createCmsSlugsSource({
      baseUrl: 'http://cms:1337',
      fetch: respondWith(page(['products/private-agent', 'legal/privacy'], 1, 1))
    });

    await expect(source.list()).resolves.toEqual([
      'products/private-agent',
      'legal/privacy'
    ]);
  });

  it('asks only for the slug field, not the whole page', async () => {
    const fetch = respondWith(page(['products/private-agent'], 1, 1));
    const source = createCmsSlugsSource({ baseUrl: 'http://cms:1337', apiToken: 'token', fetch });

    await source.list();

    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(decodeURIComponent(url ?? '')).toContain('fields[0]=slug');
    expect(init?.headers['Authorization']).toBe('Bearer token');
  });

  it('walks every page of pagination', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(page(['a'], 1, 2)))
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(page(['b'], 2, 2)))
      });
    const source = createCmsSlugsSource({ baseUrl: 'http://cms:1337', fetch });

    await expect(source.list()).resolves.toEqual(['a', 'b']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('falls back to the seed slugs when the CMS is unreachable', async () => {
    const warnings: string[] = [];
    const source = createCmsSlugsSource({
      baseUrl: 'http://cms:1337',
      onWarning: (message) => warnings.push(message),
      fetch: vi.fn(() => Promise.reject(new Error('ECONNREFUSED')))
    });

    await expect(source.list()).resolves.toEqual(seedSlugs);
    expect(warnings.at(-1)).toContain('unavailable');
  });

  it('falls back to the seed slugs when the CMS answers with an error', async () => {
    const source = createCmsSlugsSource({
      baseUrl: 'http://cms:1337',
      fetch: respondWith({ error: 'boom' }, false)
    });

    await expect(source.list()).resolves.toEqual(seedSlugs);
  });

  it('falls back to the seed slugs when the answer does not match the shape', async () => {
    const source = createCmsSlugsSource({
      baseUrl: 'http://cms:1337',
      fetch: respondWith({ data: 'нет' })
    });

    await expect(source.list()).resolves.toEqual(seedSlugs);
  });

  it('falls back to the seed slugs when nothing is published yet', async () => {
    const source = createCmsSlugsSource({
      baseUrl: 'http://cms:1337',
      fetch: respondWith(page([], 1, 1))
    });

    await expect(source.list()).resolves.toEqual(seedSlugs);
  });

  it('never calls the CMS when no address is configured', async () => {
    const fetch = respondWith(page(['products/private-agent'], 1, 1));
    const source = createCmsSlugsSource({ fetch });

    await expect(source.list()).resolves.toEqual(seedSlugs);
    expect(fetch).not.toHaveBeenCalled();
  });
});
