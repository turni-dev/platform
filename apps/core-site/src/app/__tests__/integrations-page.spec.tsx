import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Integration } from '../../integrations/integration-schema';

const catalog: Integration[] = [];

// Каталог приходит из CMS; в тесте подменяем сам источник, чтобы страницы
// проверялись целиком — вместе с разбором адреса и выбором CTA.
vi.mock('../../content/site-pages', () => ({
  siteIntegrations: { list: () => Promise.resolve(catalog) },
  cabinetUrl: undefined
}));

const { default: IntegrationsPage } = await import('../integrations/page');
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

function search(params: Record<string, string> = {}): {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
} {
  return { searchParams: Promise.resolve(params) };
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

describe('integrations catalog', () => {
  it('shows every integration of the catalog', async () => {
    const markup = renderToStaticMarkup(await IntegrationsPage(search()));

    expect(markup).toContain('Google Календарь');
    expect(markup).toContain('Telegram');
  });

  it('narrows the catalog down by the category in the url', async () => {
    const markup = renderToStaticMarkup(await IntegrationsPage(search({ category: 'messengers' })));

    expect(markup).toContain('Telegram');
    expect(markup).not.toContain('Google Календарь');
  });

  it('keeps the current filter in the links, so the address can be shared', async () => {
    const markup = renderToStaticMarkup(await IntegrationsPage(search({ category: 'messengers' })));

    expect(markup).toContain('href="/integrations?category=messengers"');
  });

  it('stays alive with an empty catalog when the CMS is unreachable', async () => {
    catalog.length = 0;

    const markup = renderToStaticMarkup(await IntegrationsPage(search()));

    expect(markup).toContain('Пока пусто');
  });
});

describe('integration card', () => {
  it('spells out what the integration can do and which rights it asks for', async () => {
    const markup = renderToStaticMarkup(await IntegrationPage(route('google-calendar')));

    expect(markup).toContain('Создаёт события');
    expect(markup).toContain('Какие права запрашиваем и зачем');
    expect(markup).toContain('Чтение и запись событий');
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
