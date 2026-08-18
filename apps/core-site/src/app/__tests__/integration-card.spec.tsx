import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Integration } from '../../integrations/integration-schema';

const catalog: Integration[] = [];

// Каталог приходит из CMS; в тесте подменяем сам источник, чтобы страница
// проверялась целиком — вместе с выбором CTA и метаданными.
vi.mock('../../content/site-pages', () => ({
  siteIntegrations: { list: () => Promise.resolve(catalog) },
  cabinetUrl: undefined
}));

const { default: IntegrationPage, generateMetadata } = await import('../integrations/[slug]/page');

function integration(patch: Partial<Integration>): Integration {
  return {
    slug: 'google-calendar',
    name: 'Google Календарь',
    category: 'calendar',
    summary: 'Ставит встречи в свободные окна.',
    whatItCan: 'Создаёт события',
    permissionsAsked: 'Чтение и запись событий — чтобы ставить встречи.',
    status: 'available',
    ...patch
  };
}

function route(slug: string): { params: Promise<{ slug: string }> } {
  return { params: Promise.resolve({ slug }) };
}

/** `notFound()` бросает ошибку с кодом 404 в digest. */
async function digestOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    return (error as { digest?: string }).digest ?? '';
  }
  throw new Error('expected the route to bail out');
}

beforeEach(() => {
  catalog.length = 0;
  catalog.push(
    integration({}),
    integration({
      slug: 'telegram',
      name: 'Telegram',
      category: 'messengers',
      status: 'in_progress'
    })
  );
});

/**
 * Карточка интеграции остаётся маршрутом: это запись типа контента, редактор
 * не заводит по странице на каждую интеграцию руками.
 */
describe('integration card', () => {
  it('spells out what the integration can do and which rights it asks for', async () => {
    const markup = renderToStaticMarkup(await IntegrationPage(route('google-calendar')));

    expect(markup).toContain('Создаёт события');
    expect(markup).toContain('Какие права запрашиваем и зачем');
    expect(markup).toContain('Чтение и запись событий');
  });

  it('leads back to the catalog and to its own category', async () => {
    const markup = renderToStaticMarkup(await IntegrationPage(route('telegram')));

    expect(markup).toContain('href="/integrations"');
    expect(markup).toContain('href="/integrations?category=messengers"');
  });

  it('sends an unavailable integration to the lead form with the requested slug', async () => {
    const markup = renderToStaticMarkup(await IntegrationPage(route('telegram')));

    expect(markup).toContain('requested_integration=telegram');
    expect(markup).toContain('Нужна эта интеграция');
  });

  it('describes the card for search engines from its own fields', async () => {
    const metadata = await generateMetadata(route('google-calendar'));

    expect(metadata.title).toContain('Google Календарь');
    expect(metadata.description).toBe('Ставит встречи в свободные окна.');
  });

  it('answers with 404 for a slug that is not in the catalog', async () => {
    expect(await digestOf(() => IntegrationPage(route('unknown')))).toContain('404');
  });
});
