import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { IntegrationCatalog } from '../integration-catalog';
import type { Integration } from '../../../integrations/integration-schema';

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

const catalog: readonly Integration[] = [
  integration({}),
  integration({ slug: 'telegram', name: 'Telegram', category: 'messengers', status: 'in_progress' })
];

const block = { __component: 'blocks.integration-catalog', heading: 'Интеграции' } as const;

function render(
  options: Readonly<{
    integrations?: readonly Integration[];
    basePath?: string;
    query?: { category?: 'messengers' | 'crm'; query?: string };
  }> = {}
): string {
  return renderToStaticMarkup(
    <IntegrationCatalog
      {...block}
      basePath={options.basePath ?? '/integrations'}
      integrations={options.integrations ?? catalog}
      query={options.query ?? {}}
    />
  );
}

describe('IntegrationCatalog', () => {
  it('shows every integration of the catalog it was handed', () => {
    const markup = render();

    expect(markup).toContain('Google Календарь');
    expect(markup).toContain('Telegram');
  });

  it('narrows the catalog down by the category from the address', () => {
    const markup = render({ query: { category: 'messengers' } });

    expect(markup).toContain('Telegram');
    expect(markup).not.toContain('Google Календарь');
  });

  it('narrows the catalog down by the search from the address', () => {
    const markup = render({ query: { query: 'кален' } });

    expect(markup).toContain('Google Календарь');
    expect(markup).not.toContain('Telegram');
  });

  it('builds the filter links from the page it stands on, not from a fixed route', () => {
    const markup = render({ basePath: '/partners/catalog', query: { category: 'messengers' } });

    expect(markup).toContain('href="/partners/catalog?category=messengers"');
    expect(markup).toContain('action="/partners/catalog"');
    expect(markup).not.toContain('href="/integrations?');
  });

  it('keeps the current search in the filter links, so the address stays shareable', () => {
    const markup = render({ query: { query: 'кален' } });

    expect(markup).toContain('category=messengers&amp;q=%D0%BA%D0%B0%D0%BB%D0%B5%D0%BD');
  });

  it('carries the current category into the search form, so the filter survives a search', () => {
    const markup = render({ query: { category: 'messengers' } });

    expect(markup).toContain('name="category"');
    expect(markup).toContain('value="messengers"');
  });

  it('works without javascript: the filter is links and the search is a get form', () => {
    const markup = render();

    expect(markup).toContain('method="get"');
    expect(markup).not.toContain('onclick');
  });

  it('links a card to the route of that integration, wherever the block stands', () => {
    const markup = render({ basePath: '/partners/catalog' });

    expect(markup).toContain('href="/integrations/google-calendar"');
  });

  it('says the catalog is empty instead of breaking the page when the CMS gave nothing', () => {
    const markup = render({ integrations: [] });

    expect(markup).toContain('Пока пусто');
    expect(markup).toContain('data-block="blocks.integration-catalog"');
  });

  it('tells an empty filter apart from an empty catalog and offers a way back', () => {
    const markup = render({ query: { query: 'нет такого' } });

    expect(markup).toContain('Ничего не нашлось');
    expect(markup).toContain('Показать весь каталог');
  });
});
