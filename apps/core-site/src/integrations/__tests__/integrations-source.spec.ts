import { describe, expect, it, vi } from 'vitest';
import type { SiteFetch } from '../../content/cms-page-source';
import { createIntegrationsSource } from '../integrations-source';

function respondWith(body: unknown, ok = true): SiteFetch {
  return vi.fn(() =>
    Promise.resolve({
      ok,
      status: ok ? 200 : 500,
      text: () => Promise.resolve(JSON.stringify(body))
    })
  );
}

const googleCalendar = {
  slug: 'google-calendar',
  name: 'Google Календарь',
  category: 'calendar',
  summary: 'Смотрит свободное время и ставит встречи.',
  whatItCan: 'Создаёт события\nПереносит встречи',
  permissionsAsked: 'Чтение и запись событий календаря — чтобы ставить встречи.',
  status: 'available',
  logo: { url: '/uploads/google-calendar.svg' },
  order: 2
};

describe('createIntegrationsSource', () => {
  it('turns a CMS entry into a catalog card', async () => {
    const source = createIntegrationsSource({
      baseUrl: 'http://cms:1337',
      fetch: respondWith({ data: [googleCalendar] })
    });

    await expect(source.list()).resolves.toEqual([
      {
        slug: 'google-calendar',
        name: 'Google Календарь',
        category: 'calendar',
        summary: 'Смотрит свободное время и ставит встречи.',
        whatItCan: 'Создаёт события\nПереносит встречи',
        permissionsAsked: 'Чтение и запись событий календаря — чтобы ставить встречи.',
        status: 'available',
        // Логотип приезжает путём без хоста, а показывается с сайта:
        // без origin CMS карточка каталога отдала бы 404 вместо картинки.
        logo: 'http://cms:1337/uploads/google-calendar.svg',
        order: 2
      }
    ]);
  });

  it('asks the CMS for the logo, otherwise the wall of logos would arrive empty', async () => {
    const fetch = respondWith({ data: [] });

    await createIntegrationsSource({ baseUrl: 'http://cms:1337', fetch }).list();

    const url = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    expect(url).toContain('http://cms:1337/api/integrations?');
    expect(url).toContain('populate%5Blogo%5D=*');
  });

  it('orders the catalog by the editor order, then by name', async () => {
    const source = createIntegrationsSource({
      baseUrl: 'http://cms:1337',
      fetch: respondWith({
        data: [
          { ...googleCalendar, slug: 'b', name: 'Б', order: 5 },
          { ...googleCalendar, slug: 'a', name: 'А', order: 5 },
          { ...googleCalendar, slug: 'c', name: 'В', order: 1 }
        ]
      })
    });

    await expect(source.list().then((items) => items.map((item) => item.slug))).resolves.toEqual([
      'c',
      'a',
      'b'
    ]);
  });

  it('drops a single broken entry instead of hiding the whole catalog', async () => {
    const source = createIntegrationsSource({
      baseUrl: 'http://cms:1337',
      // Права не заполнены — карточка без них публиковаться не должна.
      fetch: respondWith({
        data: [googleCalendar, { ...googleCalendar, slug: 'broken', permissionsAsked: undefined }]
      })
    });

    await expect(source.list().then((items) => items.map((item) => item.slug))).resolves.toEqual([
      'google-calendar'
    ]);
  });

  it('degrades to an empty catalog when the CMS answers with an error', async () => {
    const source = createIntegrationsSource({
      baseUrl: 'http://cms:1337',
      fetch: respondWith({ error: 'boom' }, false)
    });

    await expect(source.list()).resolves.toEqual([]);
  });

  it('degrades to an empty catalog when the answer does not match the shape', async () => {
    const source = createIntegrationsSource({
      baseUrl: 'http://cms:1337',
      fetch: respondWith({ data: 'нет' })
    });

    await expect(source.list()).resolves.toEqual([]);
  });

  it('never calls the CMS when no address is configured', async () => {
    const fetch = respondWith({ data: [] });

    await expect(createIntegrationsSource({ fetch }).list()).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
