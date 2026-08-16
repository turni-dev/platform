import { describe, expect, it, vi } from 'vitest';
import type { SiteFetch } from '../../content/cms-page-source';
import { createNavigationSource, seedNavigation } from '../navigation-source';

function respondWith(body: unknown, ok = true): SiteFetch {
  return vi.fn(() =>
    Promise.resolve({
      ok,
      status: ok ? 200 : 500,
      text: () => Promise.resolve(JSON.stringify(body))
    })
  );
}

describe('createNavigationSource', () => {
  it('translates the plugin tree into the shape the header expects', async () => {
    const source = createNavigationSource({
      baseUrl: 'http://cms:1337',
      fetch: respondWith([
        { title: 'Услуга', path: '/#steps' },
        {
          title: 'Продукт',
          path: '/product',
          items: [{ title: 'Кабинет', path: '/product/cabinet' }]
        }
      ])
    });

    await expect(source.get()).resolves.toEqual([
      { label: 'Услуга', href: '/#steps' },
      {
        label: 'Продукт',
        href: '/product',
        children: [{ label: 'Кабинет', href: '/product/cabinet' }]
      }
    ]);
  });

  it('asks the plugin for the rendered tree of its default menu', async () => {
    const fetch = respondWith([{ title: 'Услуга', path: '/#steps' }]);

    await createNavigationSource({ baseUrl: 'http://cms:1337', fetch }).get();

    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      'http://cms:1337/api/navigation/render/navigation?type=TREE'
    );
  });

  it('keeps the seed menu while the editor has not filled the plugin one', async () => {
    const source = createNavigationSource({
      baseUrl: 'http://cms:1337',
      fetch: respondWith([])
    });

    await expect(source.get()).resolves.toEqual(seedNavigation);
  });

  it('falls back to the seed menu when the plugin cannot answer', async () => {
    const source = createNavigationSource({
      baseUrl: 'http://cms:1337',
      fetch: respondWith({ error: 'boom' }, false)
    });

    await expect(source.get()).resolves.toEqual(seedNavigation);
  });

  it('falls back to the seed menu when the answer is not a tree', async () => {
    const source = createNavigationSource({
      baseUrl: 'http://cms:1337',
      fetch: respondWith({ data: 'нет' })
    });

    await expect(source.get()).resolves.toEqual(seedNavigation);
  });

  it('never calls the CMS when no address is configured', async () => {
    const fetch = respondWith([]);

    await expect(createNavigationSource({ fetch }).get()).resolves.toEqual(seedNavigation);
    expect(fetch).not.toHaveBeenCalled();
  });
});
