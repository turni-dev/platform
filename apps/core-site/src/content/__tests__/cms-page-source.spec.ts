import { describe, expect, it, vi } from 'vitest';
import { createCmsPageSource, type SiteFetch } from '../cms-page-source.js';
import { seedPage } from '../seed-page.js';

const cmsPage = {
  data: [
    {
      id: 7,
      documentId: 'abc',
      slug: 'home',
      title: 'Заголовок из CMS',
      blocks: [
        {
          id: 1,
          __component: 'blocks.hero',
          heading: 'Из CMS',
          subheading: 'Тоже из CMS',
          primaryCta: { id: 2, label: 'Обсудить', href: '#lead' }
        }
      ]
    }
  ]
};

function respondWith(body: unknown, ok = true): SiteFetch {
  return vi.fn(() =>
    Promise.resolve({
      ok,
      status: ok ? 200 : 500,
      text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body))
    })
  );
}

const warnings: string[] = [];
const onWarning = (message: string): void => {
  warnings.push(message);
};

describe('createCmsPageSource', () => {
  it('returns the page the editor published', async () => {
    const source = createCmsPageSource({
      baseUrl: 'http://cms:1337',
      fetch: respondWith(cmsPage)
    });

    const page = await source.getPage('home');

    expect(page?.title).toBe('Заголовок из CMS');
    expect(page?.blocks[0]).toMatchObject({ __component: 'blocks.hero', heading: 'Из CMS' });
  });

  it('drops the identifiers Strapi adds to every component', async () => {
    const source = createCmsPageSource({
      baseUrl: 'http://cms:1337',
      fetch: respondWith(cmsPage)
    });

    const page = await source.getPage('home');

    expect(page?.blocks[0]).not.toHaveProperty('id');
  });

  it('asks the CMS only for the requested slug', async () => {
    const fetch = respondWith(cmsPage);
    const source = createCmsPageSource({ baseUrl: 'http://cms:1337', apiToken: 'token', fetch });

    await source.getPage('home');

    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toContain('/api/pages');
    expect(url).toContain('filters%5Bslug%5D%5B%24eq%5D=home');
    expect(init?.headers['Authorization']).toBe('Bearer token');
  });

  it('falls back to the seed when the CMS is unreachable', async () => {
    const source = createCmsPageSource({
      baseUrl: 'http://cms:1337',
      onWarning,
      fetch: vi.fn(() => Promise.reject(new Error('ECONNREFUSED')))
    });

    await expect(source.getPage('home')).resolves.toEqual(seedPage('home'));
    expect(warnings.at(-1)).toContain('home');
  });

  it('falls back to the seed when the CMS answers with an error', async () => {
    const source = createCmsPageSource({
      baseUrl: 'http://cms:1337',
      fetch: respondWith({ error: 'boom' }, false)
    });

    await expect(source.getPage('home')).resolves.toEqual(seedPage('home'));
  });

  it('falls back to the seed when the answer is not a page', async () => {
    const source = createCmsPageSource({
      baseUrl: 'http://cms:1337',
      fetch: respondWith({ data: [{ slug: 'home', blocks: 'нет' }] })
    });

    await expect(source.getPage('home')).resolves.toEqual(seedPage('home'));
  });

  it('falls back to the seed when the page is not published yet', async () => {
    const source = createCmsPageSource({
      baseUrl: 'http://cms:1337',
      fetch: respondWith({ data: [] })
    });

    await expect(source.getPage('home')).resolves.toEqual(seedPage('home'));
  });

  it('never calls the CMS when no address is configured', async () => {
    const fetch = respondWith(cmsPage);
    const source = createCmsPageSource({ fetch });

    await expect(source.getPage('home')).resolves.toEqual(seedPage('home'));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('has nothing for a slug that is neither published nor seeded', async () => {
    const source = createCmsPageSource({
      baseUrl: 'http://cms:1337',
      fetch: respondWith({ data: [] })
    });

    await expect(source.getPage('pricing')).resolves.toBeUndefined();
  });

  it('keeps the failing answer out of the warning', async () => {
    const source = createCmsPageSource({
      baseUrl: 'http://cms:1337',
      onWarning,
      fetch: respondWith({ data: [{ slug: 'home', title: 'x', blocks: [{ secret: 'токен' }] }] })
    });

    await source.getPage('home');

    expect(warnings.at(-1)).not.toContain('токен');
  });
});
