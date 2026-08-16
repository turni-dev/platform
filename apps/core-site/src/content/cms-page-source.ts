import { PageSchema, type Page } from '../blocks/page-schema.js';
import { seedPage } from './seed-page.js';

export type SiteFetch = (
  url: string,
  init: Readonly<{ headers: Readonly<Record<string, string>> }>
) => Promise<
  Readonly<{
    ok: boolean;
    status: number;
    text: () => Promise<string>;
  }>
>;

export interface CmsPageSourceOptions {
  readonly baseUrl?: string | undefined;
  readonly apiToken?: string | undefined;
  readonly fetch: SiteFetch;
  readonly onWarning?: (message: string) => void;
}

export interface PageSource {
  getPage(slug: string): Promise<Page | undefined>;
}

/**
 * Читает страницу из Strapi и на любой неудаче отдаёт семя из репозитория.
 * Публичный сайт не должен падать оттого, что CMS перезапускается, а редактор
 * ещё не завёл страницу; предупреждение при этом не содержит ответа CMS —
 * в нём может оказаться что угодно.
 */
export function createCmsPageSource(options: CmsPageSourceOptions): PageSource {
  const warn = (slug: string, reason: string): undefined => {
    options.onWarning?.(`CMS page "${slug}" is unavailable (${reason}); serving seed content`);

    return undefined;
  };

  return {
    async getPage(slug: string): Promise<Page | undefined> {
      const fallback = (): Page | undefined => seedPage(slug);
      const baseUrl = options.baseUrl?.replace(/\/+$/, '');
      if (baseUrl === undefined || baseUrl.length === 0) {
        return fallback();
      }

      const query = new URLSearchParams({ 'filters[slug][$eq]': slug });
      for (const [key, value] of populateEntries()) {
        query.set(key, value);
      }

      let body: string;
      try {
        const response = await options.fetch(`${baseUrl}/api/pages?${query.toString()}`, {
          headers: headers(options.apiToken)
        });
        if (!response.ok) {
          warn(slug, `status ${String(response.status)}`);

          return fallback();
        }
        body = await response.text();
      } catch {
        warn(slug, 'request failed');

        return fallback();
      }

      const entry = firstEntry(body);
      if (entry === undefined) {
        warn(slug, 'no published entry');

        return fallback();
      }

      const page = PageSchema.safeParse(withoutNulls(entry));
      if (!page.success) {
        warn(slug, 'answer did not match the page schema');

        return fallback();
      }

      return page.data;
    }
  };
}

/**
 * Незаполненное поле Strapi отдаёт как `null`, а блок описан через отсутствие
 * поля — без этой чистки страница с любым пустым полем не проходит схему.
 */
function withoutNulls(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withoutNulls);
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  const cleaned: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (nested !== null) {
      cleaned[key] = withoutNulls(nested);
    }
  }

  return cleaned;
}

/**
 * Что раскрывать внутри каждого блока динамической зоны. Strapi по `*` отдаёт
 * ровно один уровень, поэтому части, вложенные глубже, перечислены путями:
 * иначе `groups` приезжает как `{ id }`, схема не сходится и страница молча
 * уезжает на семя.
 */
const blockPopulate: Readonly<Record<string, readonly string[]>> = {
  'blocks.nav': ['*'],
  'blocks.hero': ['*'],
  'blocks.feature-grid': ['*'],
  'blocks.steps': ['*'],
  'blocks.security-list': ['*'],
  'blocks.faq': ['*'],
  'blocks.footer': ['*'],
  'blocks.case-cards': ['cases', 'emptyState.cta'],
  'blocks.lead-form': [
    'labels',
    'consent',
    'groups.channels',
    'groups.hasServer',
    'groups.timeline'
  ]
};

function populateEntries(): ReadonlyArray<readonly [string, string]> {
  const entries: Array<readonly [string, string]> = [];
  for (const [component, paths] of Object.entries(blockPopulate)) {
    for (const path of paths) {
      const prefix = `populate[blocks][on][${component}][populate]`;
      if (path === '*') {
        entries.push([prefix, '*']);
        continue;
      }
      const nested = path
        .split('.')
        .map((part) => `[${part}][populate]`)
        .join('');
      entries.push([`${prefix}${nested}`, '*']);
    }
  }

  return entries;
}

function headers(apiToken: string | undefined): Record<string, string> {
  const value: Record<string, string> = { Accept: 'application/json' };
  if (apiToken !== undefined && apiToken.length > 0) {
    value['Authorization'] = `Bearer ${apiToken}`;
  }

  return value;
}

function firstEntry(body: string): unknown {
  try {
    const parsed: unknown = JSON.parse(body);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('data' in parsed) ||
      !Array.isArray(parsed.data)
    ) {
      return undefined;
    }

    return parsed.data[0];
  } catch {
    return undefined;
  }
}
