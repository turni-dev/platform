import { describe, expect, it, vi } from 'vitest';
import { StrapiCmsAdapter } from './strapi-cms.adapter.js';

const BASE_URL = 'https://cms.turni.local';

describe('StrapiCmsAdapter', () => {
  it('fetches a page by slug and maps the Strapi v5 entry to a vendor-neutral CmsPage', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            data: [
              {
                id: 1,
                documentId: 'doc-home',
                slug: 'home',
                title: 'Главная',
                blocks: [{ __component: 'shared.hero', heading: 'Turni' }],
                createdAt: '2026-07-12T00:00:00.000Z',
                publishedAt: '2026-07-12T00:00:00.000Z'
              }
            ],
            meta: { pagination: { page: 1, pageSize: 25, pageCount: 1, total: 1 } }
          })
        )
    });
    const adapter = new StrapiCmsAdapter(
      { baseUrl: BASE_URL, apiToken: 'test-token' },
      fetch
    );

    const page = await adapter.getPage('home');

    expect(fetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/pages?filters[slug][$eq]=home&populate=*`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer test-token'
        }
      }
    );
    expect(page).toEqual({
      slug: 'home',
      title: 'Главная',
      blocks: [{ __component: 'shared.hero', heading: 'Turni' }]
    });
  });

  it('returns null when no page matches the slug', async () => {
    const adapter = new StrapiCmsAdapter(
      { baseUrl: BASE_URL },
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ data: [], meta: {} }))
      })
    );

    await expect(adapter.getPage('missing')).resolves.toBeNull();
  });

  it('omits the Authorization header when no API token is configured', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ data: [], meta: {} }))
    });
    const adapter = new StrapiCmsAdapter({ baseUrl: BASE_URL }, fetch);

    await adapter.getCollection('articles');

    expect(fetch).toHaveBeenCalledWith(`${BASE_URL}/api/articles?populate=*`, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
  });

  it('maps a collection to vendor-neutral entries keyed by documentId', async () => {
    const adapter = new StrapiCmsAdapter(
      { baseUrl: BASE_URL },
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              data: [
                { id: 7, documentId: 'doc-a', title: 'Статья A', body: 'A' },
                { id: 8, documentId: 'doc-b', title: 'Статья B', body: 'B' }
              ],
              meta: {}
            })
          )
      })
    );

    const entries = await adapter.getCollection('articles');

    expect(entries).toEqual([
      { id: 'doc-a', fields: { id: 7, documentId: 'doc-a', title: 'Статья A', body: 'A' } },
      { id: 'doc-b', fields: { id: 8, documentId: 'doc-b', title: 'Статья B', body: 'B' } }
    ]);
  });

  it('fails closed on a non-success response without exposing the provider body', async () => {
    const adapter = new StrapiCmsAdapter(
      { baseUrl: BASE_URL },
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('diagnostic containing an internal secret')
      })
    );

    await expect(adapter.getCollection('articles')).rejects.toThrow(
      'Strapi request failed'
    );
    await expect(adapter.getPage('home')).rejects.not.toThrow(
      'diagnostic containing an internal secret'
    );
  });

  it('fails closed when the response shape does not match the Strapi contract', async () => {
    const adapter = new StrapiCmsAdapter(
      { baseUrl: BASE_URL },
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ unexpected: true }))
      })
    );

    await expect(adapter.getCollection('articles')).rejects.toThrow(
      'Strapi response validation failed'
    );
  });

  it('rejects an empty slug before issuing a request', async () => {
    const fetch = vi.fn();
    const adapter = new StrapiCmsAdapter({ baseUrl: BASE_URL }, fetch);

    await expect(adapter.getPage('')).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
