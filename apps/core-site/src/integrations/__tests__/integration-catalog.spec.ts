import { describe, expect, it } from 'vitest';
import {
  availableIntegrations,
  catalogHref,
  categoryFilters,
  filterIntegrations,
  integrationCta,
  parseCategory,
  parseRequestedIntegration,
  REQUESTED_INTEGRATION_PARAM
} from '../integration-catalog';
import type { Integration } from '../integration-schema';

function integration(patch: Partial<Integration>): Integration {
  return {
    slug: 'google-calendar',
    name: 'Google Календарь',
    category: 'calendar',
    summary: 'Ставит встречи.',
    whatItCan: 'Создаёт события',
    permissionsAsked: 'Чтение и запись событий — чтобы ставить встречи.',
    status: 'available',
    ...patch
  };
}

const catalog: readonly Integration[] = [
  integration({}),
  integration({ slug: 'telegram', name: 'Telegram', category: 'messengers', status: 'in_progress' }),
  integration({ slug: 'bitrix24', name: 'Битрикс24', category: 'crm', status: 'on_request' })
];

describe('parseCategory', () => {
  it('accepts a category from the url', () => {
    expect(parseCategory('crm')).toBe('crm');
  });

  it('ignores anything else instead of failing the page', () => {
    expect(parseCategory('<script>')).toBeUndefined();
    expect(parseCategory(undefined)).toBeUndefined();
    expect(parseCategory(['crm', 'calendar'])).toBeUndefined();
  });
});

describe('filterIntegrations', () => {
  it('keeps the whole catalog when nothing is asked', () => {
    expect(filterIntegrations(catalog, {})).toHaveLength(3);
  });

  it('narrows the catalog down to one category', () => {
    expect(filterIntegrations(catalog, { category: 'crm' }).map((item) => item.slug)).toEqual([
      'bitrix24'
    ]);
  });

  it('searches by name regardless of case', () => {
    expect(filterIntegrations(catalog, { query: 'бИтР' }).map((item) => item.slug)).toEqual([
      'bitrix24'
    ]);
  });

  it('combines the category with the search', () => {
    expect(filterIntegrations(catalog, { category: 'crm', query: 'telegram' })).toEqual([]);
  });
});

describe('availableIntegrations', () => {
  it('leaves only what is already working — the wall of logos shows nothing else', () => {
    expect(availableIntegrations(catalog).map((item) => item.slug)).toEqual(['google-calendar']);
  });
});

describe('categoryFilters', () => {
  it('builds every link from the page the showcase stands on', () => {
    const filters = categoryFilters({ category: 'crm' }, '/partners/catalog');

    expect(filters.every((filter) => filter.href.startsWith('/partners/catalog'))).toBe(true);
  });

  it('keeps the current search in every filter link, so the link stays shareable', () => {
    const filters = categoryFilters({ category: 'crm', query: 'битр' });

    expect(filters[0]).toEqual({ label: 'Все', href: '/integrations?q=%D0%B1%D0%B8%D1%82%D1%80', current: false });
    expect(filters.find((filter) => filter.label === 'CRM')?.current).toBe(true);
    expect(filters.find((filter) => filter.label === 'CRM')?.href).toContain('category=crm');
  });
});

describe('catalogHref', () => {
  it('falls back to the catalog route when no page path is given', () => {
    expect(catalogHref({ category: 'crm' })).toBe('/integrations?category=crm');
  });

  it('builds the address from the page the showcase stands on', () => {
    expect(catalogHref({ category: 'crm' }, '/partners/catalog')).toBe(
      '/partners/catalog?category=crm'
    );
  });

  it('survives a base path without a leading slash or with a trailing one', () => {
    expect(catalogHref({}, 'partners/catalog/')).toBe('/partners/catalog');
    expect(catalogHref({}, '')).toBe('/');
  });
});

describe('integrationCta', () => {
  it('sends a working integration to the cabinet', () => {
    expect(integrationCta(integration({}), { cabinetUrl: 'https://app.turni.ru' })).toEqual({
      label: 'Подключить',
      href: 'https://app.turni.ru/integrations/google-calendar'
    });
  });

  it('sends everything else to the lead form with the requested integration, never into a void', () => {
    expect(integrationCta(integration({ slug: 'telegram', status: 'in_progress' }), {})).toEqual({
      label: 'Нужна эта интеграция',
      href: '/products/private-agent?requested_integration=telegram#lead'
    });
  });

  it('asks for a lead when the cabinet address is not configured yet', () => {
    expect(integrationCta(integration({}), {}).href).toBe(
      '/products/private-agent?requested_integration=google-calendar#lead'
    );
  });
});

describe('parseRequestedIntegration', () => {
  it('accepts a slug that looks like a catalog slug', () => {
    expect(parseRequestedIntegration('google-calendar')).toBe('google-calendar');
  });

  it('ignores anything that is not a slug — the parameter comes from the address bar', () => {
    expect(parseRequestedIntegration('Google Календарь')).toBeUndefined();
    expect(parseRequestedIntegration('<script>alert(1)</script>')).toBeUndefined();
    expect(parseRequestedIntegration('-leading-dash')).toBeUndefined();
    expect(parseRequestedIntegration('a'.repeat(1024))).toBeUndefined();
    expect(parseRequestedIntegration('')).toBeUndefined();
    expect(parseRequestedIntegration(['a', 'b'])).toBeUndefined();
    expect(parseRequestedIntegration(undefined)).toBeUndefined();
  });

  it('reads the same parameter name the catalog button writes', () => {
    const href = integrationCta(integration({ status: 'on_request' }), {}).href;
    const value = new URL(href, 'http://localhost').searchParams.get(REQUESTED_INTEGRATION_PARAM);

    expect(parseRequestedIntegration(value ?? undefined)).toBe('google-calendar');
  });
});
