import { describe, expect, it, vi } from 'vitest';
import { createCmsPageSource, type SiteFetch } from '../cms-page-source';
import { seedPage } from '../seed-page';

const cmsPage = {
  data: [
    {
      id: 7,
      documentId: 'abc',
      slug: 'products/private-agent',
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

    const page = await source.getPage('products/private-agent');

    expect(page?.title).toBe('Заголовок из CMS');
    expect(page?.blocks[0]).toMatchObject({ __component: 'blocks.hero', heading: 'Из CMS' });
  });

  it('drops the identifiers Strapi adds to every component', async () => {
    const source = createCmsPageSource({
      baseUrl: 'http://cms:1337',
      fetch: respondWith(cmsPage)
    });

    const page = await source.getPage('products/private-agent');

    expect(page?.blocks[0]).not.toHaveProperty('id');
  });

  it('asks the CMS only for the requested slug', async () => {
    const fetch = respondWith(cmsPage);
    const source = createCmsPageSource({ baseUrl: 'http://cms:1337', apiToken: 'token', fetch });

    await source.getPage('products/private-agent');

    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toContain('/api/pages');
    expect(url).toContain('filters%5Bslug%5D%5B%24eq%5D=products%2Fprivate-agent');
    expect(init?.headers['Authorization']).toBe('Bearer token');
  });

  it('asks for the parts nested deeper than one level', () => {
    const fetch = respondWith(cmsPage);
    const source = createCmsPageSource({ baseUrl: 'http://cms:1337', fetch });

    void source.getPage('products/private-agent');

    const url = vi.mocked(fetch).mock.calls[0]?.[0] ?? '';
    // Strapi раскрывает по `*` только один уровень: без этих путей группы
    // формы и кнопка пустого состояния приезжают как голые идентификаторы.
    expect(decodeURIComponent(url)).toContain(
      'populate[blocks][on][blocks.lead-form][populate][groups][populate][channels][populate]=*'
    );
    expect(decodeURIComponent(url)).toContain(
      'populate[blocks][on][blocks.case-cards][populate][emptyState][populate][cta][populate]=*'
    );
    // Картинка героя лежит в компоненте `parts.media`, а файл — ещё уровнем
    // глубже: по `*` первый экран приехал бы без иллюстрации.
    expect(decodeURIComponent(url)).toContain(
      'populate[blocks][on][blocks.hero][populate][media][populate]=*'
    );
  });

  it('treats an unset field as absent, not as null', async () => {
    const withNulls = {
      data: [
        {
          slug: 'products/private-agent',
          title: 'Заголовок',
          description: null,
          blocks: [
            {
              __component: 'blocks.hero',
              heading: 'Из CMS',
              subheading: 'Тоже из CMS',
              primaryCta: { label: 'Обсудить', href: '#lead' },
              secondaryCta: null,
              media: null
            },
            {
              __component: 'blocks.feature-grid',
              heading: 'Что умеет',
              columns: null,
              items: [{ title: 'Отвечает', body: null }]
            }
          ]
        }
      ]
    };
    const source = createCmsPageSource({
      baseUrl: 'http://cms:1337',
      fetch: respondWith(withNulls)
    });

    const page = await source.getPage('products/private-agent');

    expect(page?.blocks).toHaveLength(2);
    expect(page?.blocks[0]).not.toHaveProperty('media');
  });

  it('falls back to the seed when the CMS is unreachable', async () => {
    const source = createCmsPageSource({
      baseUrl: 'http://cms:1337',
      onWarning,
      fetch: vi.fn(() => Promise.reject(new Error('ECONNREFUSED')))
    });

    await expect(source.getPage('products/private-agent')).resolves.toEqual(seedPage('products/private-agent'));
    expect(warnings.at(-1)).toContain('products/private-agent');
  });

  it('falls back to the seed when the CMS answers with an error', async () => {
    const source = createCmsPageSource({
      baseUrl: 'http://cms:1337',
      fetch: respondWith({ error: 'boom' }, false)
    });

    await expect(source.getPage('products/private-agent')).resolves.toEqual(seedPage('products/private-agent'));
  });

  it('falls back to the seed when the answer is not a page', async () => {
    const source = createCmsPageSource({
      baseUrl: 'http://cms:1337',
      fetch: respondWith({ data: [{ slug: 'products/private-agent', blocks: 'нет' }] })
    });

    await expect(source.getPage('products/private-agent')).resolves.toEqual(seedPage('products/private-agent'));
  });

  it('falls back to the seed when the page is not published yet', async () => {
    const source = createCmsPageSource({
      baseUrl: 'http://cms:1337',
      fetch: respondWith({ data: [] })
    });

    await expect(source.getPage('products/private-agent')).resolves.toEqual(seedPage('products/private-agent'));
  });

  it('never calls the CMS when no address is configured', async () => {
    const fetch = respondWith(cmsPage);
    const source = createCmsPageSource({ fetch });

    await expect(source.getPage('products/private-agent')).resolves.toEqual(seedPage('products/private-agent'));
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
      fetch: respondWith({ data: [{ slug: 'products/private-agent', title: 'x', blocks: [{ secret: 'токен' }] }] })
    });

    await source.getPage('products/private-agent');

    expect(warnings.at(-1)).not.toContain('токен');
  });
});

describe('media from the CMS library', () => {
  it('serves the illustration from the CMS origin, not from the site', async () => {
    const fetch = respondWith({
      data: [
        {
          id: 7,
          slug: 'products/private-agent',
          title: 'Заголовок',
          blocks: [
            {
              id: 1,
              __component: 'blocks.illustration',
              media: {
                id: 2,
                alt: 'Схема маршрута заявки',
                // Локальный провайдер Strapi отдаёт путь без хоста: как есть он
                // ушёл бы на origin сайта и вернул 404 вместо картинки.
                file: { url: '/uploads/flow_1a2b.png', width: 820, height: 733 }
              }
            }
          ]
        }
      ]
    });

    const page = await createCmsPageSource({
      baseUrl: 'https://cms.example.com/',
      fetch
    }).getPage('products/private-agent');

    expect(page?.blocks[0]).toEqual({
      __component: 'blocks.illustration',
      media: {
        src: 'https://cms.example.com/uploads/flow_1a2b.png',
        alt: 'Схема маршрута заявки',
        width: 820,
        height: 733
      }
    });
  });

  it('leaves an already absolute address alone (S3 и любой внешний провайдер)', async () => {
    const fetch = respondWith({
      data: [
        {
          id: 7,
          slug: 'products/private-agent',
          title: 'Заголовок',
          blocks: [
            {
              id: 1,
              __component: 'blocks.illustration',
              media: {
                id: 2,
                alt: 'Схема',
                file: { url: 'https://cdn.example.com/flow.png', width: 820, height: 733 }
              }
            }
          ]
        }
      ]
    });

    const page = await createCmsPageSource({
      baseUrl: 'https://cms.example.com',
      fetch
    }).getPage('products/private-agent');

    expect(page?.blocks[0]).toMatchObject({
      media: { src: 'https://cdn.example.com/flow.png' }
    });
  });
});
